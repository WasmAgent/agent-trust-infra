// Package main implements the continuous compliance monitoring daemon
// (Milestone 10 — "Continuous Compliance Monitoring", issues #294 / #291).
//
// compliance-monitor is a long-running daemon that watches agent registries
// for drift, evaluates each agent against configurable compliance rules, and
// alerts on violations. It exposes a /health endpoint for liveness probes and a
// /metrics endpoint in Prometheus text exposition format, handles SIGTERM for
// graceful shutdown, and runs periodic compliance scans at a configurable
// interval (default 5 minutes).
//
// Usage:
//
//	compliance-monitor --config /etc/compliance-monitor/config.yaml
//	compliance-monitor --config config.yaml --rules rules.json --once
//
// Configuration is accepted in either JSON (.json) or YAML (.yaml/.yml)
// format. Rules may be embedded in the config file or supplied separately via
// --rules.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"gopkg.in/yaml.v3"
)

// daemonVersion is reported by the /health endpoint.
const daemonVersion = "0.1.0"

// defaultScanInterval is applied when the config omits scan_interval.
const defaultScanInterval = 5 * time.Minute

// Duration wraps time.Duration so config files can express intervals as
// human-friendly strings ("5m", "30s") in both JSON and YAML, or as a bare
// number of seconds.
type Duration time.Duration

// UnmarshalJSON accepts a quoted duration string or a numeric second count.
func (d *Duration) UnmarshalJSON(b []byte) error {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	return d.set(v)
}

// UnmarshalYAML accepts a duration string or a numeric second count.
func (d *Duration) UnmarshalYAML(value *yaml.Node) error {
	var v any
	if err := value.Decode(&v); err != nil {
		return err
	}
	return d.set(v)
}

func (d *Duration) set(v any) error {
	switch t := v.(type) {
	case string:
		dur, err := time.ParseDuration(t)
		if err != nil {
			return fmt.Errorf("invalid duration %q: %w", t, err)
		}
		*d = Duration(dur)
	case int:
		*d = Duration(time.Duration(t) * time.Second)
	case int64:
		*d = Duration(time.Duration(t) * time.Second)
	case float64:
		*d = Duration(t * float64(time.Second))
	default:
		return fmt.Errorf("invalid duration value: %v", v)
	}
	return nil
}

// MarshalJSON renders the duration as a string for diagnostics.
func (d Duration) MarshalJSON() ([]byte, error) {
	return json.Marshal(time.Duration(d).String())
}

// Config is the daemon configuration. The same struct deserialises from both
// JSON and YAML, so deployments can choose either format.
type Config struct {
	ScanInterval Duration         `json:"scan_interval" yaml:"scan_interval"`
	RegistryDir  string           `json:"registry_dir,omitempty" yaml:"registry_dir"`
	RegistryURL  string           `json:"registry_url,omitempty" yaml:"registry_url"`
	HealthAddr   string           `json:"health_addr" yaml:"health_addr"`
	MetricsAddr  string           `json:"metrics_addr" yaml:"metrics_addr"`
	WebhookURL   string           `json:"webhook_url,omitempty" yaml:"webhook_url"`
	MaxRetries   int              `json:"max_retries,omitempty" yaml:"max_retries"`
	Rules        []ComplianceRule `json:"rules" yaml:"rules"`

	httpClient *http.Client
}

// defaults applies built-in defaults for any unset fields.
func (c *Config) defaults() {
	if c.ScanInterval == 0 {
		c.ScanInterval = Duration(defaultScanInterval)
	}
	if c.HealthAddr == "" {
		c.HealthAddr = ":9091"
	}
	if c.MetricsAddr == "" {
		c.MetricsAddr = ":9090"
	}
	if c.MaxRetries < 1 {
		c.MaxRetries = 3
	}
}

// RegistryClient returns the HTTP client used for registry polling and webhook
// delivery, constructing a bounded-timeout client on first use.
func (c *Config) RegistryClient() *http.Client {
	if c.httpClient == nil {
		c.httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	return c.httpClient
}

// loadConfig reads and parses a config file, selecting JSON or YAML decoding
// by extension. It applies defaults and returns an error if no registry source
// is configured.
func loadConfig(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	cfg := &Config{}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".yaml", ".yml":
		if err := yaml.Unmarshal(raw, cfg); err != nil {
			return nil, fmt.Errorf("parse YAML config: %w", err)
		}
	case ".json", "":
		if err := json.Unmarshal(raw, cfg); err != nil {
			return nil, fmt.Errorf("parse JSON config: %w", err)
		}
	default:
		return nil, fmt.Errorf("unsupported config extension %q (use .json, .yaml, or .yml)", filepath.Ext(path))
	}
	cfg.defaults()
	if strings.TrimSpace(cfg.RegistryDir) == "" && strings.TrimSpace(cfg.RegistryURL) == "" {
		return nil, errors.New("config must set registry_dir or registry_url")
	}
	return cfg, nil
}

// loadRules loads an optional standalone rules file (JSON or YAML) and appends
// the rules to the config. A standalone file is convenient for managing rule
// sets independently of the daemon configuration.
func loadRules(cfg *Config, path string) error {
	if path == "" {
		return nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read rules %s: %w", path, err)
	}
	var rules []ComplianceRule
	switch strings.ToLower(filepath.Ext(path)) {
	case ".yaml", ".yml":
		if err := yaml.Unmarshal(raw, &rules); err != nil {
			return fmt.Errorf("parse YAML rules: %w", err)
		}
	default:
		if err := json.Unmarshal(raw, &rules); err != nil {
			return fmt.Errorf("parse JSON rules: %w", err)
		}
	}
	cfg.Rules = append(cfg.Rules, rules...)
	return nil
}

// ---- Metrics (Prometheus text exposition) ----

// Metrics holds daemon-wide counters rendered at /metrics. All fields are
// accessed atomically so the HTTP handler is safe to call mid-scan.
type Metrics struct {
	checks     atomic.Int64
	violations atomic.Int64
	alerts     atomic.Int64
	scans      atomic.Int64
	drift      atomic.Int64
	lastScan   atomic.Int64
}

// NewMetrics returns a zeroed Metrics.
func NewMetrics() *Metrics { return &Metrics{} }

func (m *Metrics) AddCheck()     { m.checks.Add(1) }
func (m *Metrics) AddViolation() { m.violations.Add(1) }
func (m *Metrics) AddAlert()     { m.alerts.Add(1) }
func (m *Metrics) AddDrift()     { m.drift.Add(1) }
func (m *Metrics) ScanComplete(at time.Time) {
	m.scans.Add(1)
	m.lastScan.Store(at.Unix())
}

// Render produces the metrics in Prometheus text exposition format.
func (m *Metrics) Render() string {
	var b strings.Builder
	writeCounter(&b, "compliance_checks_total", "Total compliance checks executed.", m.checks.Load())
	writeCounter(&b, "compliance_violations_total", "Total compliance rule violations detected.", m.violations.Load())
	writeCounter(&b, "compliance_alerts_total", "Total alert deliveries triggered.", m.alerts.Load())
	writeCounter(&b, "compliance_scans_total", "Total fleet scans completed.", m.scans.Load())
	writeCounter(&b, "compliance_drift_events_total", "Total agent drift events detected.", m.drift.Load())
	writeGauge(&b, "compliance_last_scan_timestamp_seconds", "Unix time of the last completed scan.", m.lastScan.Load())
	return b.String()
}

func writeCounter(b *strings.Builder, name, help string, value int64) {
	fmt.Fprintf(b, "# HELP %s %s\n# TYPE %s counter\n%s %d\n", name, help, name, name, value)
}

func writeGauge(b *strings.Builder, name, help string, value int64) {
	fmt.Fprintf(b, "# HELP %s %s\n# TYPE %s gauge\n%s %d\n", name, help, name, name, value)
}

// ---- Daemon ----

// Daemon wires together the fleet manager, metrics, HTTP servers, and the
// periodic scan loop.
type Daemon struct {
	cfg     *Config
	fm      *FleetManager
	metrics *Metrics
	logger  *slog.Logger
	out     io.Writer
}

// NewDaemon constructs a Daemon from parsed configuration.
func NewDaemon(cfg *Config, logger *slog.Logger, out io.Writer) *Daemon {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if out == nil {
		out = io.Discard
	}
	metrics := NewMetrics()
	return &Daemon{
		cfg:     cfg,
		fm:      NewFleetManager(cfg, metrics, logger),
		metrics: metrics,
		logger:  logger,
		out:     out,
	}
}

// healthHandler returns 200 OK with the daemon status and version.
func (d *Daemon) healthHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"version": daemonVersion,
		})
	}
}

// metricsHandler serves the Prometheus text exposition output.
func (d *Daemon) metricsHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		fmt.Fprint(w, d.metrics.Render())
	}
}

// newRouter builds the HTTP route table served by both the health and metrics
// addresses. Each address also serves the other endpoint as a convenience so
// either port is sufficient for shallow health checks.
func (d *Daemon) newRouter() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", d.healthHandler())
	mux.HandleFunc("/metrics", d.metricsHandler())
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"service": "compliance-monitor"})
	})
	return mux
}

// RunScanOnce performs a single compliance scan, logs the summary, and returns
// the report. Used by --once and by the periodic loop.
func (d *Daemon) RunScanOnce(ctx context.Context) (*ScanReport, error) {
	report, err := d.fm.RunScan(ctx)
	if err != nil {
		return nil, err
	}
	fmt.Fprintf(d.out, "scan complete: %d agents, %d compliant, %d violations, %d drifted in %s\n",
		report.AgentCount, report.CompliantCount, len(report.Violations),
		len(report.DriftedAgents), time.Duration(report.Duration))
	for _, v := range report.Violations {
		fmt.Fprintf(d.out, "  violation: agent=%s rule=%s severity=%s field=%s\n",
			v.AgentID, v.RuleID, v.Severity, v.Field)
	}
	return report, nil
}

// Serve runs the daemon until ctx is cancelled: it starts the health and
// metrics HTTP servers, runs an initial scan, then scans on the configured
// interval. All servers and in-flight work are shut down cleanly on exit.
func (d *Daemon) Serve(ctx context.Context) error {
	handler := d.newRouter()
	healthSrv := &http.Server{Addr: d.cfg.HealthAddr, Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	metricsSrv := &http.Server{Addr: d.cfg.MetricsAddr, Handler: handler, ReadHeaderTimeout: 5 * time.Second}

	serveErr := make(chan error, 2)
	go func() { serveErr <- healthSrv.ListenAndServe() }()
	go func() { serveErr <- metricsSrv.ListenAndServe() }()

	d.logger.Info("compliance monitor started",
		"health_addr", d.cfg.HealthAddr, "metrics_addr", d.cfg.MetricsAddr,
		"scan_interval", time.Duration(d.cfg.ScanInterval).String(),
		"registry_dir", d.cfg.RegistryDir, "registry_url", d.cfg.RegistryURL,
		"rules", len(d.cfg.Rules))

	// Run an immediate scan so the first compliance result is available without
	// waiting for the first tick.
	if _, err := d.RunScanOnce(ctx); err != nil {
		d.logger.Error("initial scan failed", "error", err)
	}

	ticker := time.NewTicker(time.Duration(d.cfg.ScanInterval))
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return d.shutdown(healthSrv, metricsSrv)
		case err := <-serveErr:
			if err != nil && !errors.Is(err, http.ErrServerClosed) {
				_ = d.shutdown(healthSrv, metricsSrv)
				return fmt.Errorf("http server: %w", err)
			}
		case <-ticker.C:
			if _, err := d.RunScanOnce(ctx); err != nil {
				d.logger.Error("periodic scan failed", "error", err)
			}
		}
	}
}

// shutdown gracefully stops both HTTP servers with a bounded deadline.
func (d *Daemon) shutdown(servers ...*http.Server) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var firstErr error
	for _, srv := range servers {
		if err := srv.Shutdown(ctx); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// ---- Entry point ----

// Run parses args, loads configuration, and either runs a single scan (--once)
// or serves until SIGTERM/SIGINT. It returns a process exit code and error,
// mirroring cmd/registry-service's convention.
func Run(args []string, stdout, stderr io.Writer) (int, error) {
	fs := flag.NewFlagSet("compliance-monitor", flag.ContinueOnError)
	fs.SetOutput(stderr)

	configPath := fs.String("config", "/etc/compliance-monitor/config.yaml", "path to daemon config (.json or .yaml)")
	rulesPath := fs.String("rules", "", "optional standalone rules file (.json or .yaml)")
	once := fs.Bool("once", false, "run a single compliance scan and exit")
	scanInterval := fs.Duration("scan-interval", 0, "override scan_interval from config (e.g. 5m, 30s)")

	if err := fs.Parse(args); err != nil {
		return 2, nil
	}

	cfg, err := loadConfig(*configPath)
	if err != nil {
		return 1, err
	}
	if err := loadRules(cfg, *rulesPath); err != nil {
		return 1, err
	}
	if *scanInterval > 0 {
		cfg.ScanInterval = Duration(*scanInterval)
	}

	logger := slog.New(slog.NewTextHandler(stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	daemon := NewDaemon(cfg, logger, stdout)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	if *once {
		report, err := daemon.RunScanOnce(ctx)
		if err != nil {
			return 1, err
		}
		if len(report.Violations) > 0 {
			return 1, nil // non-zero exit signals compliance violations to callers/Cron
		}
		return 0, nil
	}

	if err := daemon.Serve(ctx); err != nil {
		return 1, err
	}
	return 0, nil
}

func main() {
	code, err := Run(os.Args[1:], os.Stdout, os.Stderr)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	os.Exit(code)
}
