package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
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
