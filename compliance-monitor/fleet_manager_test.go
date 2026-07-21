package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// writeAgents writes each agent as <id>.json under dir.
func writeAgents(t *testing.T, dir string, agents ...Agent) {
	t.Helper()
	for _, a := range agents {
		raw, err := json.Marshal(a)
		if err != nil {
			t.Fatalf("marshal agent: %v", err)
		}
		if err := os.WriteFile(filepath.Join(dir, a.ID+".json"), raw, 0o644); err != nil {
			t.Fatalf("write agent: %v", err)
		}
	}
}

func TestEvaluateRule_Operators(t *testing.T) {
	agent := Agent{
		ID:          "a1",
		Identity:    "did:web:example.com:a1",
		Signed:      true,
		Version:     "1.2.3",
		MaxSeverity: "medium",
		Permissions: []string{"fs:read", "net:get"},
		Attributes:  map[string]string{"owner": "team-a"},
	}

	cases := []struct {
		name       string
		rule       ComplianceRule
		wantOK     bool
		wantFail   bool // expect the rule to fail (non-ok with empty detail)
		wantDetail bool // expect a non-empty detail (malformed rule)
	}{
		{"identity exists", ComplianceRule{Field: "identity", Operator: "exists"}, true, false, false},
		{"identity missing", ComplianceRule{Field: "identity", Operator: "not_exists"}, false, true, false},
		{"signed eq true", ComplianceRule{Field: "signed", Operator: "eq", Threshold: "true"}, true, false, false},
		{"signed eq false fails", ComplianceRule{Field: "signed", Operator: "eq", Threshold: "false"}, false, true, false},
		{"severity lte high", ComplianceRule{Field: "max_severity", Operator: "lte", Threshold: "high"}, true, false, false},
		{"severity gte critical fails (medium)", ComplianceRule{Field: "max_severity", Operator: "gte", Threshold: "critical"}, false, true, false},
		{"perm count lte 10", ComplianceRule{Field: "permissions.count", Operator: "lte", Threshold: "10"}, true, false, false},
		{"perm count gt 1", ComplianceRule{Field: "permissions.count", Operator: "gt", Threshold: "1"}, true, false, false},
		{"perm not_contains admin", ComplianceRule{Field: "permissions", Operator: "not_contains", Threshold: "admin:"}, true, false, false},
		{"perm contains net", ComplianceRule{Field: "permissions", Operator: "contains", Threshold: "net:"}, true, false, false},
		{"version in set", ComplianceRule{Field: "version", Operator: "in", Threshold: "1.2.3,2.0.0"}, true, false, false},
		{"version not_in set", ComplianceRule{Field: "version", Operator: "not_in", Threshold: "9.9.9"}, true, false, false},
		{"attr owner eq", ComplianceRule{Field: "attr.owner", Operator: "eq", Threshold: "team-a"}, true, false, false},
		{"attr owner ne fails", ComplianceRule{Field: "attr.owner", Operator: "ne", Threshold: "team-a"}, false, true, false},
		{"unsupported operator", ComplianceRule{Field: "signed", Operator: "matches"}, false, false, true},
		{"uncomparable numeric", ComplianceRule{Field: "identity", Operator: "gte", Threshold: "high"}, false, false, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ok, detail := evaluateRule(agent, tc.rule)
			if ok != tc.wantOK {
				t.Fatalf("evaluateRule ok=%v want=%v (detail=%q)", ok, tc.wantOK, detail)
			}
			if tc.wantFail && (ok || detail != "") {
				t.Fatalf("expected clean failure, got ok=%v detail=%q", ok, detail)
			}
			if tc.wantDetail && detail == "" {
				t.Fatalf("expected non-empty detail for malformed rule")
			}
		})
	}
}

func TestEvaluateAgentCompliance(t *testing.T) {
	cfg := &Config{
		RegistryDir: t.TempDir(),
		Rules: []ComplianceRule{
			{ID: "r-identity", Field: "identity", Operator: "exists", Severity: "high"},
			{ID: "r-signed", Field: "signed", Operator: "eq", Threshold: "true", Severity: "critical"},
		},
	}
	fm := NewFleetManager(cfg, NewMetrics(), nopLogger{})

	// Fully compliant agent.
	compliant, violations := fm.EvaluateAgentCompliance(Agent{ID: "ok", Identity: "id-1", Signed: true})
	if !compliant || len(violations) != 0 {
		t.Fatalf("expected compliant, got %v %v", compliant, violations)
	}

	// Agent missing identity and signing → two violations.
	compliant, violations = fm.EvaluateAgentCompliance(Agent{ID: "bad", Identity: "", Signed: false})
	if compliant {
		t.Fatalf("expected non-compliant")
	}
	if len(violations) != 2 {
		t.Fatalf("expected 2 violations, got %d", len(violations))
	}
	// Each violation should carry agent + rule metadata.
	for _, v := range violations {
		if v.AgentID != "bad" || v.RuleID == "" {
			t.Fatalf("malformed violation: %+v", v)
		}
	}
}

func TestReadAgentsFromDir(t *testing.T) {
	dir := t.TempDir()
	writeAgents(t, dir,
		Agent{ID: "alpha", Identity: "id-a", Signed: true},
		Agent{ID: "beta", Identity: "id-b"},
	)
	// Non-JSON file should be skipped.
	if err := os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("ignore"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Malformed JSON should be skipped without aborting the read.
	if err := os.WriteFile(filepath.Join(dir, "broken.json"), []byte("{nope"), 0o644); err != nil {
		t.Fatal(err)
	}

	agents, err := readAgentsFromDir(dir)
	if err != nil {
		t.Fatalf("readAgentsFromDir: %v", err)
	}
	if len(agents) != 2 {
		t.Fatalf("expected 2 agents, got %d", len(agents))
	}

	// Missing directory yields empty result, not an error.
	got, err := readAgentsFromDir(filepath.Join(dir, "does-not-exist"))
	if err != nil || len(got) != 0 {
		t.Fatalf("missing dir should yield empty,nil; got %v %v", got, err)
	}
}

func TestFetchAgentsFromURL(t *testing.T) {
	body := []Agent{{ID: "x", Identity: "id-x"}, {ID: "y", Identity: "id-y"}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(body)
	}))
	t.Cleanup(srv.Close)

	got, err := fetchAgentsFromURL(context.Background(), srv.URL, srv.Client())
	if err != nil {
		t.Fatalf("fetchAgentsFromURL: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 agents, got %d", len(got))
	}
}

func TestFetchAgentsFromURL_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)
	if _, err := fetchAgentsFromURL(context.Background(), srv.URL, srv.Client()); err == nil {
		t.Fatal("expected error for 500 response")
	}
}

func TestRetryRecoversAndExhausts(t *testing.T) {
	// Registry that fails twice then succeeds.
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if atomic.AddInt32(&calls, 1) <= 2 {
			http.Error(w, "transient", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]Agent{{ID: "recovered"}})
	}))
	t.Cleanup(srv.Close)

	cfg := &Config{RegistryURL: srv.URL, MaxRetries: 3}
	fm := NewFleetManager(cfg, NewMetrics(), nopLogger{})
	fm.retryBaseBackoff = time.Millisecond

	agents, err := fm.WatchAgentRegistries(context.Background())
	if err != nil {
		t.Fatalf("expected recovery after retries: %v", err)
	}
	if len(agents) != 1 || agents[0].ID != "recovered" {
		t.Fatalf("unexpected agents: %+v", agents)
	}
	if calls != 3 {
		t.Fatalf("expected 3 attempts, got %d", calls)
	}

	// A persistently failing registry should exhaust retries and error.
	failSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "down", http.StatusServiceUnavailable)
	}))
	t.Cleanup(failSrv.Close)
	cfg2 := &Config{RegistryURL: failSrv.URL, MaxRetries: 2}
	fm2 := NewFleetManager(cfg2, NewMetrics(), nopLogger{})
	fm2.retryBaseBackoff = time.Millisecond
	if _, err := fm2.WatchAgentRegistries(context.Background()); err == nil {
		t.Fatal("expected error after retries exhausted")
	}
}

func TestRetryRespectsContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "down", http.StatusServiceUnavailable)
	}))
	t.Cleanup(srv.Close)
	cfg := &Config{RegistryURL: srv.URL, MaxRetries: 10}
	fm := NewFleetManager(cfg, NewMetrics(), nopLogger{})
	fm.retryBaseBackoff = 50 * time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if _, err := fm.WatchAgentRegistries(ctx); err == nil {
		t.Fatal("expected cancellation error")
	}
}

func TestDriftDetection(t *testing.T) {
	dir := t.TempDir()
	cfg := &Config{RegistryDir: dir, Rules: []ComplianceRule{{ID: "r", Field: "signed", Operator: "eq", Threshold: "true"}}}
	fm := NewFleetManager(cfg, NewMetrics(), nopLogger{})

	// First scan seeds the baseline — no drift reported.
	writeAgents(t, dir, Agent{ID: "a", Identity: "id-a", Signed: true})
	rep1, err := fm.RunScan(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(rep1.DriftedAgents) != 0 {
		t.Fatalf("first scan should not report drift, got %v", rep1.DriftedAgents)
	}

	// Second scan with a changed agent → drift.
	writeAgents(t, dir, Agent{ID: "a", Identity: "id-a", Signed: false}) // changed
	writeAgents(t, dir, Agent{ID: "b", Identity: "id-b", Signed: true})  // new
	rep2, err := fm.RunScan(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(rep2.DriftedAgents) != 2 {
		t.Fatalf("expected 2 drifted agents, got %v", rep2.DriftedAgents)
	}

	// Stable third scan → no new drift.
	rep3, err := fm.RunScan(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(rep3.DriftedAgents) != 0 {
		t.Fatalf("stable scan should not report drift, got %v", rep3.DriftedAgents)
	}
}

func TestComplianceHistory(t *testing.T) {
	cfg := &Config{RegistryDir: t.TempDir(), Rules: []ComplianceRule{{ID: "r", Field: "signed", Operator: "eq", Threshold: "true"}}}
	fm := NewFleetManager(cfg, NewMetrics(), nopLogger{})

	fm.recordHistory("a", false, 2)
	fm.recordHistory("a", true, 0)
	h := fm.History("a")
	if len(h) != 2 {
		t.Fatalf("expected 2 history entries, got %d", len(h))
	}
	if !h[1].Compliant || h[1].ViolationCount != 0 {
		t.Fatalf("latest entry should be compliant: %+v", h[1])
	}
}

func TestHistoryBounded(t *testing.T) {
	cfg := &Config{RegistryDir: t.TempDir()}
	fm := NewFleetManager(cfg, NewMetrics(), nopLogger{})
	for i := 0; i < historyLimit+50; i++ {
		fm.recordHistory("a", i%2 == 0, i)
	}
	if got := len(fm.History("a")); got != historyLimit {
		t.Fatalf("history not bounded: got %d want %d", got, historyLimit)
	}
}

func TestRunScanCountsMetricsAndReports(t *testing.T) {
	dir := t.TempDir()
	writeAgents(t, dir,
		Agent{ID: "good", Identity: "id-g", Signed: true, Version: "1.0"},
		Agent{ID: "bad", Identity: "id-b", Signed: false}, // missing signing
	)
	cfg := &Config{RegistryDir: dir, Rules: []ComplianceRule{
		{ID: "signed", Field: "signed", Operator: "eq", Threshold: "true", Severity: "critical"},
	}}
	m := NewMetrics()
	fm := NewFleetManager(cfg, m, nopLogger{})

	rep, err := fm.RunScan(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if rep.AgentCount != 2 || rep.CompliantCount != 1 {
		t.Fatalf("counts wrong: %+v", rep)
	}
	if len(rep.Violations) != 1 || rep.Violations[0].AgentID != "bad" {
		t.Fatalf("expected 1 violation on bad agent, got %+v", rep.Violations)
	}
	if m.violations.Load() != 1 || m.checks.Load() != 2 {
		t.Fatalf("metrics wrong: checks=%d violations=%d", m.checks.Load(), m.violations.Load())
	}
}
