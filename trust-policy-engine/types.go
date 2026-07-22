// Package trustpolicyengine provides a policy evaluation engine with composable
// rule sets, real-time compliance scoring, and automated violation flagging for
// agent runtime monitoring.
package trustpolicyengine

// SupportedDSLVersion is the only DSL version accepted by the engine.
const SupportedDSLVersion = "1.0"

// PolicyDocument represents a single policy set that may include other policy
// documents for composition.
type PolicyDocument struct {
	DSLVersion  string          `json:"dsl_version,omitempty"`
	PolicySetID string          `json:"policy_set_id"`
	Version     string          `json:"version"`
	Rules       []PolicyRule    `json:"rules"`
	Includes    []PolicyDocument `json:"includes,omitempty"`
}

// PolicyRule is a single rule within a policy set.
type PolicyRule struct {
	ID          string     `json:"id"`
	Description string     `json:"description"`
	Effect      string     `json:"effect"`
	When        *Condition `json:"when,omitempty"`
	Assert      *Condition `json:"assert,omitempty"`
	Message     string     `json:"message,omitempty"`
	Severity    string     `json:"severity,omitempty"`
}

// Condition describes a path-based predicate applied to a trust artifact.
type Condition struct {
	Path   string   `json:"path"`
	Op     string   `json:"op"`
	Value  any      `json:"value,omitempty"`
	Values []string `json:"values,omitempty"`
}

// EvaluationResult is the output of evaluating a policy against an artifact.
type EvaluationResult struct {
	PolicySetID string         `json:"policy_set_id"`
	Version     string         `json:"version"`
	Allowed     bool           `json:"allowed"`
	Violations  []RuleFinding  `json:"violations"`
	Warnings    []RuleFinding  `json:"warnings"`
	PassedRules []string       `json:"passed_rules"`
	Metadata    map[string]int `json:"metadata"`
}

// RuleFinding captures a single violation or warning produced by a rule.
type RuleFinding struct {
	PolicySetID string `json:"policy_set_id,omitempty"`
	Version     string `json:"version,omitempty"`
	RuleID      string `json:"rule_id"`
	Severity    string `json:"severity,omitempty"`
	Description string `json:"description,omitempty"`
	Message     string `json:"message"`
}

// composedRule pairs a rule with the policy set that contributed it.
type composedRule struct {
	policySetID string
	version     string
	rule        PolicyRule
}