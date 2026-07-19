package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
)

const supportedDSLVersion = "1.0"

type policyDocument struct {
	DSLVersion  string           `json:"dsl_version,omitempty"`
	PolicySetID string           `json:"policy_set_id"`
	Version     string           `json:"version"`
	Rules       []policyRule     `json:"rules"`
	Includes    []policyDocument `json:"includes,omitempty"`
}

type policyRule struct {
	ID          string     `json:"id"`
	Description string     `json:"description"`
	Effect      string     `json:"effect"`
	When        *condition `json:"when,omitempty"`
	Assert      *condition `json:"assert,omitempty"`
	Message     string     `json:"message,omitempty"`
	Severity    string     `json:"severity,omitempty"`
}

type condition struct {
	Path   string   `json:"path"`
	Op     string   `json:"op"`
	Value  any      `json:"value,omitempty"`
	Values []string `json:"values,omitempty"`
}

type evaluationResult struct {
	PolicySetID string         `json:"policy_set_id"`
	Version     string         `json:"version"`
	Allowed     bool           `json:"allowed"`
	Violations  []ruleFinding  `json:"violations"`
	Warnings    []ruleFinding  `json:"warnings"`
	PassedRules []string       `json:"passed_rules"`
	Metadata    map[string]int `json:"metadata"`
}

type ruleFinding struct {
	PolicySetID string `json:"policy_set_id,omitempty"`
	Version     string `json:"version,omitempty"`
	RuleID      string `json:"rule_id"`
	Severity    string `json:"severity,omitempty"`
	Description string `json:"description,omitempty"`
	Message     string `json:"message"`
}

type composedRule struct {
	policySetID string
	version     string
	rule        policyRule
}

func main() {
	exitCode, err := run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	os.Exit(exitCode)
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) (int, error) {
	flags := flag.NewFlagSet("policy-engine", flag.ContinueOnError)
	flags.SetOutput(stderr)

	policyPath := flags.String("policy", "", "path to policy DSL JSON")
	artifactPath := flags.String("artifact", "-", "path to trust artifact JSON, or - for stdin")
	format := flags.String("format", "json", "output format: json or text")

	if err := flags.Parse(args); err != nil {
		return 2, err
	}
	if *policyPath == "" {
		return 2, errors.New("missing required -policy")
	}

	policyBytes, err := os.ReadFile(*policyPath)
	if err != nil {
		return 2, fmt.Errorf("read policy: %w", err)
	}
	artifactBytes, err := readInput(*artifactPath, stdin)
	if err != nil {
		return 2, fmt.Errorf("read artifact: %w", err)
	}

	var policy policyDocument
	if err := decodeJSON(policyBytes, &policy); err != nil {
		return 2, fmt.Errorf("parse policy: %w", err)
	}
	if err := validatePolicy(policy); err != nil {
		return 2, err
	}

	var artifact any
	if err := decodeJSON(artifactBytes, &artifact); err != nil {
		return 2, fmt.Errorf("parse artifact: %w", err)
	}

	result, err := evaluatePolicy(policy, artifact)
	if err != nil {
		return 2, err
	}

	switch *format {
	case "json":
		encoder := json.NewEncoder(stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(result); err != nil {
			return 2, err
		}
	case "text":
		writeTextResult(stdout, result)
	default:
		return 2, fmt.Errorf("unsupported -format %q", *format)
	}

	if !result.Allowed {
		return 1, nil
	}
	return 0, nil
}

func readInput(path string, stdin io.Reader) ([]byte, error) {
	if path == "-" {
		return io.ReadAll(stdin)
	}
	return os.ReadFile(path)
}

func decodeJSON(data []byte, dst any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	return decoder.Decode(dst)
}

func validatePolicy(policy policyDocument) error {
	if err := validatePolicyDocument(policy); err != nil {
		return err
	}
	return nil
}

func validatePolicyDocument(policy policyDocument) error {
	if policy.DSLVersion != "" && policy.DSLVersion != supportedDSLVersion {
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

func evaluatePolicy(policy policyDocument, artifact any) (evaluationResult, error) {
	rules := composePolicyRules(policy)
	result := evaluationResult{
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
		matches, err := evaluateCondition(*rule.When, artifact)
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
			ok, err := evaluateCondition(*rule.Assert, artifact)
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

func composePolicyRules(policy policyDocument) []composedRule {
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

func countPolicyDocuments(policy policyDocument) int {
	count := 1
	for _, included := range policy.Includes {
		count += countPolicyDocuments(included)
	}
	return count
}

func findingForRule(composed composedRule, fallback string) ruleFinding {
	rule := composed.rule
	message := rule.Message
	if message == "" {
		message = fallback
	}
	return ruleFinding{
		PolicySetID: composed.policySetID,
		Version:     composed.version,
		RuleID:      rule.ID,
		Severity:    rule.Severity,
		Description: rule.Description,
		Message:     message,
	}
}

func evaluateCondition(cond condition, artifact any) (bool, error) {
	values, err := valuesAtPath(artifact, cond.Path)
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

func valuesAtPath(root any, path string) ([]string, error) {
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

func writeTextResult(w io.Writer, result evaluationResult) {
	status := "allowed"
	if !result.Allowed {
		status = "rejected"
	}
	fmt.Fprintf(w, "%s %s@%s\n", status, result.PolicySetID, result.Version)
	for _, violation := range result.Violations {
		fmt.Fprintf(w, "violation %s: %s\n", violation.RuleID, violation.Message)
	}
	for _, warning := range result.Warnings {
		fmt.Fprintf(w, "warning %s: %s\n", warning.RuleID, warning.Message)
	}
}
