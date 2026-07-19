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
