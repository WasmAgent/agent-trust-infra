package trustpolicyengine

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// DecodeJSON unmarshals data into dst using json.Decoder with UseNumber so
// that numeric values preserve their original representation.
func DecodeJSON(data []byte, dst any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	return decoder.Decode(dst)
}

// ValidatePolicy checks the structural integrity of a policy document
// including DSL version, required fields, rule effects, and nested includes.
func ValidatePolicy(policy PolicyDocument) error {
	return validatePolicyDocument(policy)
}

func validatePolicyDocument(policy PolicyDocument) error {
	if policy.DSLVersion != "" && policy.DSLVersion != SupportedDSLVersion {
		return fmt.Errorf("policy %q has unsupported dsl_version %q", policy.PolicySetID, policy.DSLVersion)
	}
	if policy.PolicySetID == "" {
		return errors.New("policy missing policy_set_id")
	}
	if policy.Version == "" {
		return errors.New("policy missing version")
	}
	if len(policy.Rules) == 0 && len(policy.Includes) == 0 {
		return errors.New("policy must contain at least one rule")
	}
	for i, rule := range policy.Rules {
		if rule.ID == "" {
			return fmt.Errorf("policy rule %d missing id", i)
		}
		switch rule.Effect {
		case "deny", "warn":
			if rule.When == nil {
				return fmt.Errorf("policy rule %q missing when condition", rule.ID)
			}
		case "require":
			if rule.When == nil || rule.Assert == nil {
				return fmt.Errorf("policy rule %q requires both when and assert conditions", rule.ID)
			}
		default:
			return fmt.Errorf("policy rule %q has unsupported effect %q", rule.ID, rule.Effect)
		}
	}
	for i, included := range policy.Includes {
		if err := validatePolicyDocument(included); err != nil {
			return fmt.Errorf("included policy %d: %w", i, err)
		}
	}
	return nil
}

// EvaluatePolicy evaluates a policy document against a trust artifact (parsed
// JSON value) and returns the evaluation result.
func EvaluatePolicy(policy PolicyDocument, artifact any) (EvaluationResult, error) {
	rules := composePolicyRules(policy)
	result := EvaluationResult{
		PolicySetID: policy.PolicySetID,
		Version:     policy.Version,
		Allowed:     true,
		Metadata: map[string]int{
			"policy_sets_composed": countPolicyDocuments(policy),
			"rules_evaluated":      len(rules),
		},
	}

	for _, composed := range rules {
		rule := composed.rule
		matches, err := EvaluateCondition(*rule.When, artifact)
		if err != nil {
			return result, fmt.Errorf("rule %q when: %w", rule.ID, err)
		}
		if !matches {
			result.PassedRules = append(result.PassedRules, rule.ID)
			continue
		}

		switch rule.Effect {
		case "deny":
			result.Allowed = false
			result.Violations = append(result.Violations, findingForRule(composed, "deny condition matched"))
		case "warn":
			result.Warnings = append(result.Warnings, findingForRule(composed, "warn condition matched"))
			result.PassedRules = append(result.PassedRules, rule.ID)
		case "require":
			ok, err := EvaluateCondition(*rule.Assert, artifact)
			if err != nil {
				return result, fmt.Errorf("rule %q assert: %w", rule.ID, err)
			}
			if ok {
				result.PassedRules = append(result.PassedRules, rule.ID)
				continue
			}
			result.Allowed = false
			result.Violations = append(result.Violations, findingForRule(composed, "required assertion failed"))
		}
	}

	sort.Strings(result.PassedRules)
	result.Metadata["rules_passed"] = len(result.PassedRules)
	result.Metadata["violations"] = len(result.Violations)
	result.Metadata["warnings"] = len(result.Warnings)
	return result, nil
}

// ComposePolicyRules flattens a policy document and all of its includes into
// a single ordered slice of composedRule values.
func ComposePolicyRules(policy PolicyDocument) []PolicyRule {
	composed := composePolicyRules(policy)
	rules := make([]PolicyRule, len(composed))
	for i, c := range composed {
		rules[i] = c.rule
	}
	return rules
}

func composePolicyRules(policy PolicyDocument) []composedRule {
	var rules []composedRule
	for _, included := range policy.Includes {
		rules = append(rules, composePolicyRules(included)...)
	}
	for _, rule := range policy.Rules {
		rules = append(rules, composedRule{
			policySetID: policy.PolicySetID,
			version:     policy.Version,
			rule:        rule,
		})
	}
	return rules
}

func countPolicyDocuments(policy PolicyDocument) int {
	count := 1
	for _, included := range policy.Includes {
		count += countPolicyDocuments(included)
	}
	return count
}

func findingForRule(composed composedRule, fallback string) RuleFinding {
	rule := composed.rule
	message := rule.Message
	if message == "" {
		message = fallback
	}
	return RuleFinding{
		PolicySetID: composed.policySetID,
		Version:     composed.version,
		RuleID:      rule.ID,
		Severity:    rule.Severity,
		Description: rule.Description,
		Message:     message,
	}
}

// EvaluateCondition evaluates a single condition against a trust artifact.
func EvaluateCondition(cond Condition, artifact any) (bool, error) {
	values, err := ValuesAtPath(artifact, cond.Path)
	if err != nil {
		return false, err
	}

	expected := cond.Values
	if cond.Value != nil {
		expected = append(expected, scalarString(cond.Value))
	}

	switch cond.Op {
	case "exists":
		return len(values) > 0, nil
	case "missing":
		return len(values) == 0, nil
	case "equals":
		return anyValueIn(values, expected), nil
	case "not_equals":
		return len(values) > 0 && !anyValueIn(values, expected), nil
	case "in":
		return len(values) > 0 && allValuesIn(values, expected), nil
	case "not_in":
		return anyValueOutside(values, expected), nil
	case "contains":
		return anyStringContains(values, expected), nil
	case "intersects":
		return anyValueIn(values, expected), nil
	default:
		return false, fmt.Errorf("unsupported op %q", cond.Op)
	}
}

// ValuesAtPath resolves a dot-separated path (with [] suffix for array
// traversal) against a JSON-parsed artifact and returns all matching scalar
// string values.
func ValuesAtPath(root any, path string) ([]string, error) {
	if path == "" {
		return nil, errors.New("condition path is required")
	}

	nodes := []any{root}
	for _, segment := range strings.Split(path, ".") {
		if segment == "" {
			return nil, fmt.Errorf("invalid empty path segment in %q", path)
		}

		arrayMode := strings.HasSuffix(segment, "[]")
		key := strings.TrimSuffix(segment, "[]")
		var next []any

		for _, node := range nodes {
			object, ok := node.(map[string]any)
			if !ok {
				continue
			}
			value, ok := object[key]
			if !ok {
				continue
			}
			if arrayMode {
				next = appendArrayItems(next, value)
				continue
			}
			next = append(next, value)
		}
		nodes = next
	}

	var values []string
	for _, node := range nodes {
		values = appendScalarValues(values, node)
	}
	return values, nil
}

func appendScalarValues(values []string, node any) []string {
	switch typed := node.(type) {
	case []any:
		for _, item := range typed {
			values = appendScalarValues(values, item)
		}
	case []map[string]any:
		for _, item := range typed {
			values = appendScalarValues(values, item)
		}
	case []string:
		values = append(values, typed...)
	case map[string]any:
		return values
	default:
		values = append(values, scalarString(typed))
	}
	return values
}

func appendArrayItems(items []any, value any) []any {
	switch typed := value.(type) {
	case []any:
		return append(items, typed...)
	case []map[string]any:
		for _, item := range typed {
			items = append(items, item)
		}
	case []string:
		for _, item := range typed {
			items = append(items, item)
		}
	}
	return items
}

func scalarString(value any) string {
	switch typed := value.(type) {
	case json.Number:
		return typed.String()
	case string:
		return typed
	case bool:
		return strconv.FormatBool(typed)
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func anyValueIn(values, expected []string) bool {
	allowed := stringSet(expected)
	for _, value := range values {
		if allowed[value] {
			return true
		}
	}
	return false
}

func allValuesIn(values, expected []string) bool {
	allowed := stringSet(expected)
	for _, value := range values {
		if !allowed[value] {
			return false
		}
	}
	return true
}

func anyValueOutside(values, expected []string) bool {
	allowed := stringSet(expected)
	for _, value := range values {
		if !allowed[value] {
			return true
		}
	}
	return false
}

func anyStringContains(values, expected []string) bool {
	for _, value := range values {
		for _, needle := range expected {
			if strings.Contains(value, needle) {
				return true
			}
		}
	}
	return false
}

func stringSet(values []string) map[string]bool {
	set := make(map[string]bool, len(values))
	for _, value := range values {
		set[value] = true
	}
	return set
}