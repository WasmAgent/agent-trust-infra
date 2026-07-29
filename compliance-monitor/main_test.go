package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

func TestDurationUnmarshal(t *testing.T) {
	// JSON: string form
	var dj Duration
	if err := json.Unmarshal([]byte(`"5m"`), &dj); err != nil {
		t.Fatal(err)
	}
	if time.Duration(dj) != 5*time.Minute {
		t.Fatalf("got %v", time.Duration(dj))
	}
	// JSON: numeric seconds
	var dn Duration
	if err := json.Unmarshal([]byte(`30`), &dn); err != nil {
		t.Fatal(err)
	}
	if time.Duration(dn) != 30*time.Second {
		t.Fatalf("got %v", time.Duration(dn))
	}
	// YAML: string form
	var dy Duration
	if err := yaml.Unmarshal([]byte("1h"), &dy); err != nil {
		t.Fatal(err)
	}
	if time.Duration(dy) != time.Hour {
		t.Fatalf("got %v", time.Duration(dy))
	}
	// YAML: numeric seconds
	var dy2 Duration
	if err := yaml.Unmarshal([]byte("90"), &dy2); err != nil {
		t.Fatal(err)
	}
	if time.Duration(dy2) != 90*time.Second {
		t.Fatalf("got %v", time.Duration(dy2))
	}
	// Invalid string should error.
	if err := json.Unmarshal([]byte(`"nope"`), new(Duration)); err == nil {
		t.Fatal("expected error for invalid duration")
	}
}

func TestLoadConfig_YAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	body := `
scan_interval: 30s
registry_dir: ` + dir + `
health_addr: ":7071"
metrics_addr: ":7072"
max_retries: 5
rules:
  - id: signed
    field: signed
    operator: eq
    threshold: "true"
    severity: critical
`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := loadConfig(path)
	if err != nil {
		t.Fatalf("loadConfig: %v", err)
	}
	if time.Duration(cfg.ScanInterval) != 30*time.Second {
		t.Fatalf("scan_interval got %v", time.Duration(cfg.ScanInterval))
	}
	if cfg.MaxRetries != 5 || cfg.HealthAddr != ":7071" || cfg.MetricsAddr != ":7072" {
		t.Fatalf("config not parsed correctly: %+v", cfg)
	}
	if len(cfg.Rules) != 1 || cfg.Rules[0].ID != "signed" {
		t.Fatalf("rules not parsed: %+v", cfg.Rules)
	}
}

func TestLoadConfig_JSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	body := map[string]any{
		"scan_interval": "1m",
		"registry_dir":  dir,
		"rules": []map[string]any{
			{"id": "ident", "field": "identity", "operator": "exists"},
		},
	}
	raw, _ := json.Marshal(body)
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := loadConfig(path)
	if err != nil {
		t.Fatalf("loadConfig: %v", err)
	}
	if time.Duration(cfg.ScanInterval) != time.Minute {
		t.Fatalf("got %v", time.Duration(cfg.ScanInterval))
	}
}

func TestLoadConfig_DefaultsApplied(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "c.yaml")
	if err := os.WriteFile(path, []byte("registry_dir: "+dir+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := loadConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if time.Duration(cfg.ScanInterval) != defaultScanInterval {
		t.Fatalf("expected default scan interval, got %v", time.Duration(cfg.ScanInterval))
	}
	if cfg.MaxRetries != 3 || cfg.HealthAddr != ":9091" || cfg.MetricsAddr != ":9090" {
		t.Fatalf("defaults wrong: %+v", cfg)
	}
}

func TestLoadConfig_RequiresRegistrySource(t *testing.T) {
	path := filepath.Join(t.TempDir(), "c.yaml")
	if err := os.WriteFile(path, []byte("scan_interval: 1m\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := loadConfig(path); err == nil {
		t.Fatal("expected error when no registry source configured")
	}
}

func TestLoadRules_Appends(t *testing.T) {
	cfg := &Config{RegistryDir: t.TempDir(), Rules: []ComplianceRule{{ID: "a"}}}
	path := filepath.Join(t.TempDir(), "rules.json")
	raw, _ := json.Marshal([]ComplianceRule{{ID: "b"}, {ID: "c"}})
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := loadRules(cfg, path); err != nil {
		t.Fatal(err)
	}
	if len(cfg.Rules) != 3 || cfg.Rules[2].ID != "c" {
		t.Fatalf("rules not appended: %+v", cfg.Rules)
	}
}

func TestMetricsRender_PrometheusFormat(t *testing.T) {
	m := NewMetrics()
	m.AddCheck()
	m.AddCheck()
	m.AddViolation()
	m.AddAlert()
	m.AddDrift()
	m.ScanComplete(time.Unix(1700000000, 0))

	out := m.Render()
	for _, want := range []string{
		"# TYPE compliance_checks_total counter",
		"compliance_checks_total 2",
		"# TYPE compliance_violations_total counter",
		"compliance_violations_total 1",
		"# TYPE compliance_alerts_total counter",
		"compliance_alerts_total 1",
		"# TYPE compliance_drift_events_total counter",
		"compliance_drift_events_total 1",
		"# TYPE compliance_scans_total counter",
		"# TYPE compliance_last_scan_timestamp_seconds gauge",
		"compliance_last_scan_timestamp_seconds 1700000000",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("metrics missing %q\noutput:\n%s", want, out)
		}
	}
}

func TestHealthHandler(t *testing.T) {
	d := NewDaemon(&Config{RegistryDir: t.TempDir()}, nil, io.Discard)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	d.healthHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("health status = %d, want 200", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" || body["version"] != daemonVersion {
		t.Fatalf("health body wrong: %v", body)
	}
}

func TestMetricsHandler(t *testing.T) {
	d := NewDaemon(&Config{RegistryDir: t.TempDir()}, nil, nil)
	d.metrics.AddCheck()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()
	d.metricsHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("metrics status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Fatalf("content-type = %s", ct)
	}
	if !strings.Contains(rec.Body.String(), "compliance_checks_total 1") {
		t.Fatalf("metrics body missing value: %s", rec.Body.String())
	}
}

func TestRunOnce_Compliant(t *testing.T) {
	dir := t.TempDir()
	writeAgents(t, dir, Agent{ID: "ok", Identity: "id-1", Signed: true, Version: "1.0"})

	cfgPath := filepath.Join(t.TempDir(), "c.yaml")
	body := "registry_dir: " + dir + "\nrules:\n  - id: signed\n    field: signed\n    operator: eq\n    threshold: \"true\"\n"
	if err := os.WriteFile(cfgPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	code, err := Run([]string{"--config", cfgPath, "--once"}, &out, &out)
	if err != nil {
		t.Fatalf("Run: %v (out=%s)", err, out.String())
	}
	if code != 0 {
		t.Fatalf("expected exit 0 for compliant fleet, got %d (out=%s)", code, out.String())
	}
	if !strings.Contains(out.String(), "scan complete") {
		t.Fatalf("expected scan summary, got: %s", out.String())
	}
}

func TestRunOnce_ViolationsExitNonZero(t *testing.T) {
	dir := t.TempDir()
	writeAgents(t, dir, Agent{ID: "bad", Identity: "id-1", Signed: false})

	cfgPath := filepath.Join(t.TempDir(), "c.yaml")
	body := "registry_dir: " + dir + "\nrules:\n  - id: signed\n    field: signed\n    operator: eq\n    threshold: \"true\"\n    severity: critical\n"
	if err := os.WriteFile(cfgPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	code, err := Run([]string{"--config", cfgPath, "--once"}, &out, &out)
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code == 0 {
		t.Fatalf("expected non-zero exit for violations, got 0 (out=%s)", out.String())
	}
	if !strings.Contains(out.String(), "violation") {
		t.Fatalf("expected violation line in output: %s", out.String())
	}
}

func TestRunOnce_BadConfigExitCode(t *testing.T) {
	var out bytes.Buffer
	code, err := Run([]string{"--config", "/no/such/config.yaml", "--once"}, &out, &out)
	if code != 1 {
		t.Fatalf("expected exit 1 for missing config, got %d (err=%v)", code, err)
	}
}

func TestServe_StopsOnContextCancel(t *testing.T) {
	// Use ephemeral ports chosen by the OS to avoid collisions.
	dir := t.TempDir()
	writeAgents(t, dir, Agent{ID: "ok", Identity: "id-1", Signed: true})

	cfg := &Config{
		RegistryDir:  dir,
		HealthAddr:   "127.0.0.1:0",
		MetricsAddr:  "127.0.0.1:0",
		ScanInterval: Duration(time.Hour),
	}
	cfg.defaults()
	d := NewDaemon(cfg, nil, io.Discard)

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	// ListenAndServe on :0 + Shutdown is exercised here; we only assert the
	// daemon terminates cleanly when ctx expires.
	done := make(chan error, 1)
	go func() { done <- d.Serve(ctx) }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Serve returned error: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Serve did not return after context cancellation")
	}
}
