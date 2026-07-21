package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/WasmAgent/agent-trust-infra/internal/performance"
)

func TestPolicyEngineRejectsUnapprovedMCPServer(t *testing.T) {
	policyPath := writeTempJSON(t, "policy.json", map[string]any{
		"policy_set_id": "org-governance",
		"version":       "1.0.0",
		"rules": []map[string]any{
			{
				"id":      "approved-mcp-servers",
				"effect":  "deny",
				"message": "artifact references an unapproved MCP server",
				"when": map[string]any{
					"path":   "servers[].server_id",
					"op":     "not_in",
					"values": []string{"filesystem-prod", "github-prod"},
				},
			},
		},
	})
	artifactPath := writeTempJSON(t, "artifact.json", map[string]any{
		"servers": []map[string]any{
			{"server_id": "github-prod"},
			{"server_id": "unknown-lab"},
		},
	})

	var stdout, stderr strings.Builder
	exitCode, err := run([]string{"-policy", policyPath, "-artifact", artifactPath}, strings.NewReader(""), &stdout, &stderr)
	if err != nil {
		t.Fatalf("run returned error: %v", err)
	}
	if exitCode != 1 {
		t.Fatalf("exitCode = %d, want 1; stdout=%s stderr=%s", exitCode, stdout.String(), stderr.String())
	}

	var result evaluationResult
	if err := json.Unmarshal([]byte(stdout.String()), &result); err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if result.Allowed {
		t.Fatal("result.Allowed = true, want false")
	}
	if len(result.Violations) != 1 || result.Violations[0].RuleID != "approved-mcp-servers" {
		t.Fatalf("unexpected violations: %#v", result.Violations)
	}
}

func TestPolicyEngineRequiresAEPForFileSystemTools(t *testing.T) {
	policy := policyDocument{
		PolicySetID: "org-governance",
		Version:     "1.0.0",
		Rules: []policyRule{
			{
				ID:     "filesystem-tools-require-aep",
				Effect: "require",
				When: &condition{
					Path:   "tools[].permissions[]",
					Op:     "contains",
					Values: []string{"filesystem"},
				},
				Assert: &condition{
					Path: "evidence_layer.aep_references[]",
					Op:   "exists",
				},
			},
		},
	}
	artifact := map[string]any{
		"tools": []map[string]any{
			{
				"tool_id":     "file-read",
				"permissions": []string{"filesystem:read"},
			},
		},
		"evidence_layer": map[string]any{},
	}

	result, err := evaluatePolicy(policy, artifact)
	if err != nil {
		t.Fatalf("evaluatePolicy returned error: %v", err)
	}
	if result.Allowed {
		t.Fatal("result.Allowed = true, want false")
	}
	if len(result.Violations) != 1 || result.Violations[0].RuleID != "filesystem-tools-require-aep" {
		t.Fatalf("unexpected violations: %#v", result.Violations)
	}
}

func TestPolicyEngineComposesVersionedPolicySets(t *testing.T) {
	policy := policyDocument{
		DSLVersion:  "1.0",
		PolicySetID: "org-governance",
		Version:     "2026.07",
		Includes: []policyDocument{
			{
				DSLVersion:  "1.0",
				PolicySetID: "mcp-baseline",
				Version:     "1.2.0",
				Rules: []policyRule{
					{
						ID:     "approved-mcp-servers",
						Effect: "deny",
						When: &condition{
							Path:   "servers[].server_id",
							Op:     "not_in",
							Values: []string{"filesystem-prod", "github-prod"},
						},
					},
				},
			},
			{
				DSLVersion:  "1.0",
				PolicySetID: "aep-baseline",
				Version:     "2.0.0",
				Rules: []policyRule{
					{
						ID:     "filesystem-tools-require-aep",
						Effect: "require",
						When: &condition{
							Path:   "tools[].permissions[]",
							Op:     "contains",
							Values: []string{"filesystem"},
						},
						Assert: &condition{
							Path: "evidence_layer.aep_references[]",
							Op:   "exists",
						},
					},
				},
			},
		},
		Rules: []policyRule{
			{
				ID:     "passport-expiry-present",
				Effect: "require",
				When: &condition{
					Path: "agent_id",
					Op:   "exists",
				},
				Assert: &condition{
					Path: "passport.expires_at",
					Op:   "exists",
				},
			},
		},
	}
	artifact := map[string]any{
		"agent_id": "agent-123",
		"servers": []map[string]any{
			{"server_id": "github-prod"},
		},
		"tools": []map[string]any{
			{
				"tool_id":     "file-read",
				"permissions": []string{"filesystem:read"},
			},
		},
		"evidence_layer": map[string]any{
			"aep_references": []string{"aep://audit/123"},
		},
		"passport": map[string]any{
			"expires_at": "2026-12-31T00:00:00Z",
		},
	}

	result, err := evaluatePolicy(policy, artifact)
	if err != nil {
		t.Fatalf("evaluatePolicy returned error: %v", err)
	}
	if !result.Allowed {
		t.Fatalf("result.Allowed = false, want true; violations=%#v", result.Violations)
	}
	if result.Metadata["policy_sets_composed"] != 3 {
		t.Fatalf("policy_sets_composed = %d, want 3", result.Metadata["policy_sets_composed"])
	}
	if result.Metadata["rules_evaluated"] != 3 {
		t.Fatalf("rules_evaluated = %d, want 3", result.Metadata["rules_evaluated"])
	}
	if len(result.PassedRules) != 3 {
		t.Fatalf("passed rules = %#v, want 3 rules", result.PassedRules)
	}
}

func TestPolicyEngineRejectsUnsupportedDSLVersion(t *testing.T) {
	err := validatePolicy(policyDocument{
		DSLVersion:  "9.0",
		PolicySetID: "future-policy",
		Version:     "1.0.0",
		Rules: []policyRule{
			{
				ID:     "future-rule",
				Effect: "warn",
				When: &condition{
					Path: "agent_id",
					Op:   "exists",
				},
			},
		},
	})
	if err == nil {
		t.Fatal("validatePolicy returned nil, want unsupported dsl_version error")
	}
	if !strings.Contains(err.Error(), `unsupported dsl_version "9.0"`) {
		t.Fatalf("validatePolicy error = %q, want unsupported dsl_version", err.Error())
	}
}

// --- Benchmarks ---

func BenchmarkEvaluatePolicySingleRule(b *testing.B) {
	policy := policyDocument{
		PolicySetID: "bench",
		Version:     "1.0.0",
		Rules: []policyRule{
			{
				ID:     "bench-rule",
				Effect: "deny",
				When: &condition{
					Path: "agent_id",
					Op:   "exists",
				},
			},
		},
	}
	artifact := map[string]any{"agent_id": "agent-1"}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := evaluatePolicy(policy, artifact); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkEvaluatePolicyTenRules(b *testing.B) {
	policy := buildBenchPolicy(10, 0)
	artifact := buildBenchArtifact(5)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := evaluatePolicy(policy, artifact); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkEvaluatePolicyHundredRules(b *testing.B) {
	policy := buildBenchPolicy(100, 0)
	artifact := buildBenchArtifact(20)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := evaluatePolicy(policy, artifact); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkEvaluatePolicyWithIncludes(b *testing.B) {
	policy := policyDocument{
		PolicySetID: "root",
		Version:     "1.0.0",
		Includes: []policyDocument{
			buildBenchPolicyDoc("included-a", "1.0", 10),
			buildBenchPolicyDoc("included-b", "2.0", 10),
		},
		Rules: buildBenchRules(10),
	}
	artifact := buildBenchArtifact(20)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := evaluatePolicy(policy, artifact); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkComposePolicyRules(b *testing.B) {
	policy := policyDocument{
		PolicySetID: "root",
		Version:     "1.0.0",
		Includes: []policyDocument{
			buildBenchPolicyDoc("inc-a", "1.0", 10),
			buildBenchPolicyDoc("inc-b", "2.0", 10),
			buildBenchPolicyDoc("inc-c", "3.0", 10),
		},
		Rules: buildBenchRules(15),
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = composePolicyRules(policy)
	}
}

func BenchmarkValuesAtPathShallow(b *testing.B) {
	artifact := map[string]any{
		"agent_id": "agent-1",
		"name":     "test-agent",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := valuesAtPath(artifact, "agent_id"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkValuesAtPathArrayTraversal(b *testing.B) {
	artifact := map[string]any{
		"tools": buildBenchArtifactSlice(50),
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := valuesAtPath(artifact, "tools[].tool_id"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkValuesAtPathDeep(b *testing.B) {
	artifact := map[string]any{
		"level1": map[string]any{
			"level2": map[string]any{
				"level3": map[string]any{
					"level4": map[string]any{
						"target": "deep-value",
					},
				},
			},
		},
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := valuesAtPath(artifact, "level1.level2.level3.level4.target"); err != nil {
			b.Fatal(err)
		}
	}
}

// --- Regression gate tests for the policy engine ---

func TestPolicyEvaluationSingleRuleRegression(t *testing.T) {
	policy := policyDocument{
		PolicySetID: "regression-test",
		Version:     "1.0.0",
		Rules: []policyRule{
			{
				ID:     "test-rule",
				Effect: "deny",
				When: &condition{
					Path: "agent_id",
					Op:   "exists",
				},
			},
		},
	}
	artifact := map[string]any{"agent_id": "agent-1"}
	performance.CheckRegression(t, performance.Threshold{
		Name:        "policy-eval-single-rule",
		MaxDuration: 20 * time.Microsecond,
		WarmupRuns:  100,
		MeasureRuns: 1000,
	}, func() {
		if _, err := evaluatePolicy(policy, artifact); err != nil {
			t.Fatal(err)
		}
	})
}

func TestPolicyEvaluationHundredRulesRegression(t *testing.T) {
	policy := buildBenchPolicy(100, 0)
	artifact := buildBenchArtifact(20)
	performance.CheckRegression(t, performance.Threshold{
		Name:        "policy-eval-hundred-rules",
		MaxDuration: 500 * time.Microsecond,
		WarmupRuns:  50,
		MeasureRuns: 500,
	}, func() {
		if _, err := evaluatePolicy(policy, artifact); err != nil {
			t.Fatal(err)
		}
	})
}

func TestPolicyEvaluationWithIncludesRegression(t *testing.T) {
	policy := policyDocument{
		PolicySetID: "root",
		Version:     "1.0.0",
		Includes: []policyDocument{
			buildBenchPolicyDoc("inc-a", "1.0", 10),
			buildBenchPolicyDoc("inc-b", "2.0", 10),
		},
		Rules: buildBenchRules(10),
	}
	artifact := buildBenchArtifact(20)
	performance.CheckRegression(t, performance.Threshold{
		Name:        "policy-eval-with-includes",
		MaxDuration: 200 * time.Microsecond,
		WarmupRuns:  50,
		MeasureRuns: 500,
	}, func() {
		if _, err := evaluatePolicy(policy, artifact); err != nil {
			t.Fatal(err)
		}
	})
}

// --- Helpers for benchmarks and regression tests ---

func buildBenchPolicy(ruleCount, includeDepth int) policyDocument {
	policy := policyDocument{
		PolicySetID: "bench",
		Version:     "1.0.0",
		Rules:       buildBenchRules(ruleCount),
	}
	if includeDepth > 0 {
		policy.Includes = []policyDocument{
			buildBenchPolicy(ruleCount, includeDepth-1),
		}
	}
	return policy
}

func buildBenchPolicyDoc(id, version string, ruleCount int) policyDocument {
	return policyDocument{
		DSLVersion:  "1.0",
		PolicySetID: id,
		Version:     version,
		Rules:       buildBenchRules(ruleCount),
	}
}

func buildBenchRules(n int) []policyRule {
	rules := make([]policyRule, n)
	for i := 0; i < n; i++ {
		rules[i] = policyRule{
			ID:     fmt.Sprintf("bench-rule-%04d", i),
			Effect: "deny",
			When: &condition{
				Path:   fmt.Sprintf("tools[%d].permissions[]", i%10),
				Op:     "contains",
				Values: []string{"filesystem"},
			},
		}
	}
	return rules
}

func buildBenchArtifact(toolCount int) map[string]any {
	return map[string]any{
		"tools": buildBenchArtifactSlice(toolCount),
	}
}

func buildBenchArtifactSlice(n int) []map[string]any {
	tools := make([]map[string]any, n)
	for i := range tools {
		tools[i] = map[string]any{
			"tool_id":     fmt.Sprintf("tool-%04d", i),
			"permissions": []string{"filesystem:read", "network:write"},
		}
	}
	return tools
}

func writeTempJSON(t *testing.T, name string, value any) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), name)
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal %s: %v", name, err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

func TestBenchWorkloadsProduceValidPolicies(t *testing.T) {
	for _, workload := range []string{benchWorkloadSmall, benchWorkloadMedium, benchWorkloadLarge} {
		policy := benchPolicyDocument(workload)
		if err := validatePolicy(policy); err != nil {
			t.Errorf("workload %s: validatePolicy failed: %v", workload, err)
			continue
		}
		artifact := benchArtifact(workload)
		if _, err := evaluatePolicy(policy, artifact); err != nil {
			t.Errorf("workload %s: evaluatePolicy failed: %v", workload, err)
		}
	}
}

func TestBenchSuitePublishesAllOperations(t *testing.T) {
	metrics, err := runValidationBenchmarksIter(benchWorkloadSmall, 3)
	if err != nil {
		t.Fatalf("runValidationBenchmarksIter: %v", err)
	}

	want := []string{
		benchOpValidatePolicy,
		benchOpComposePolicyRules,
		benchOpEvaluateCondition,
		benchOpValuesAtPath,
		benchOpEvaluatePolicy,
	}
	seen := make(map[string]bool, len(metrics))
	for _, m := range metrics {
		seen[m.Operation] = true
		if m.Workload != benchWorkloadSmall {
			t.Errorf("operation %s: workload = %q, want %q", m.Operation, m.Workload, benchWorkloadSmall)
		}
		if m.Iterations != 3 {
			t.Errorf("operation %s: iterations = %d, want 3", m.Operation, m.Iterations)
		}
		if m.ThroughputOpsPerSec <= 0 {
			t.Errorf("operation %s: throughput = %f, want > 0", m.Operation, m.ThroughputOpsPerSec)
		}
		if m.AvgLatencyNsPerOp <= 0 {
			t.Errorf("operation %s: avg latency = %f, want > 0", m.Operation, m.AvgLatencyNsPerOp)
		}
		if m.P99LatencyNs < m.P50LatencyNs {
			t.Errorf("operation %s: p99 (%f) < p50 (%f)", m.Operation, m.P99LatencyNs, m.P50LatencyNs)
		}
	}
	for _, op := range want {
		if !seen[op] {
			t.Errorf("operation %s not present in published metrics", op)
		}
	}
}

func TestRunBenchSubcommandPublishesResults(t *testing.T) {
	resultsPath := filepath.Join(t.TempDir(), "bench.json")

	var stdout, stderr strings.Builder
	exitCode, err := run(
		[]string{benchSubcommand, "-workload", benchWorkloadSmall, "-iterations", "2", "-results", resultsPath},
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if err != nil {
		t.Fatalf("run returned error: %v", err)
	}
	if exitCode != 0 {
		t.Fatalf("exitCode = %d, want 0; stderr=%s", exitCode, stderr.String())
	}

	var report benchReport
	if err := json.Unmarshal([]byte(stdout.String()), &report); err != nil {
		t.Fatalf("decode published report: %v\nstdout=%s", err, stdout.String())
	}
	if len(report.Metrics) == 0 {
		t.Fatal("published report has no metrics")
	}
	if report.GoVersion == "" {
		t.Error("published report missing go_version")
	}

	fileData, err := os.ReadFile(resultsPath)
	if err != nil {
		t.Fatalf("published results file not written: %v", err)
	}
	var fileReport benchReport
	if err := json.Unmarshal(fileData, &fileReport); err != nil {
		t.Fatalf("decode published results file: %v", err)
	}
	if len(fileReport.Metrics) != len(report.Metrics) {
		t.Errorf("file metrics = %d, want %d", len(fileReport.Metrics), len(report.Metrics))
	}
}

func TestBenchRejectsUnknownWorkload(t *testing.T) {
	var stdout, stderr strings.Builder
	exitCode, err := run(
		[]string{benchSubcommand, "-workload", "enormous"},
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if err == nil {
		t.Fatal("run returned nil error, want unsupported -workload error")
	}
	if exitCode != 2 {
		t.Errorf("exitCode = %d, want 2", exitCode)
	}
}
