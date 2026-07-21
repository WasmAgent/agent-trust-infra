package main

// Fleet monitoring logic for the continuous compliance monitor — issue #294,
// Milestone 10 ("Continuous Compliance Monitoring").
//
// This file owns the agent representation, the configurable compliance rule
// model, and the FleetManager that discovers agents from a registry, evaluates
// each agent against the rule set, detects drift between scans, and alerts on
// violations. The daemon wiring (config, HTTP servers, metrics) lives in
// main.go; the rule-driven checking lives here.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// severityRank orders risk severities so rules can compare "max_severity"
// fields (e.g. agent must not exceed "high"). Unknown severities fall back to
// numeric comparison via numericCompare.
var severityRank = map[string]int{
	"none": 0, "info": 1, "low": 2, "medium": 3, "high": 4, "critical": 5,
}

// Agent is the compliance monitor's view of a registered agent. It is
// populated from agent JSON files on disk or from an HTTP registry, and is the
// subject of compliance rule evaluation.
type Agent struct {
	ID          string            `json:"agent_id" yaml:"agent_id"`
	Name        string            `json:"name,omitempty" yaml:"name"`
	Identity    string            `json:"identity,omitempty" yaml:"identity"`
	Version     string            `json:"version,omitempty" yaml:"version"`
	Signed      bool              `json:"signed" yaml:"signed"`
	MaxSeverity string            `json:"max_severity,omitempty" yaml:"max_severity"`
	Permissions []string          `json:"permissions,omitempty" yaml:"permissions"`
	Tools       []AgentTool       `json:"tools,omitempty" yaml:"tools"`
	Attributes  map[string]string `json:"attributes,omitempty" yaml:"attributes"`
}

// AgentTool is a single tool exposed by an agent with its permission scope.
type AgentTool struct {
	Name       string `json:"name,omitempty" yaml:"name"`
	Permission string `json:"permission,omitempty" yaml:"permission"`
}

// ComplianceRule is a single configurable compliance assertion. A rule
// describes a condition (field + operator + threshold) that each agent MUST
// satisfy; failing the condition raises a violation at the rule's severity.
//
// Supported check_type values: "security", "trust_chain", "artifact_verification".
// Supported operators: eq, ne, gte, lte, gt, lt, exists, not_exists,
// contains, not_contains, in, not_in.
type ComplianceRule struct {
	ID          string `json:"id" yaml:"id"`
	Description string `json:"description,omitempty" yaml:"description"`
	CheckType   string `json:"check_type,omitempty" yaml:"check_type"`
	Field       string `json:"field" yaml:"field"`
	Operator    string `json:"operator" yaml:"operator"`
	Threshold   string `json:"threshold,omitempty" yaml:"threshold"`
	Severity    string `json:"severity,omitempty" yaml:"severity"`
}

// Violation records a single failed rule against a specific agent.
type Violation struct {
	AgentID   string `json:"agent_id"`
	RuleID    string `json:"rule_id"`
	Severity  string `json:"severity,omitempty"`
	CheckType string `json:"check_type,omitempty"`
	Field     string `json:"field"`
	Detail    string `json:"detail,omitempty"`
}

// ComplianceRecord is a single point in an agent's compliance history.
type ComplianceRecord struct {
	Timestamp      time.Time `json:"timestamp"`
	Compliant      bool      `json:"compliant"`
	ViolationCount int       `json:"violation_count"`
}

// ScanReport summarises one full pass over the fleet.
type ScanReport struct {
	StartedAt      time.Time   `json:"started_at"`
	AgentCount     int         `json:"agent_count"`
	CompliantCount int         `json:"compliant_count"`
	Violations     []Violation `json:"violations,omitempty"`
	DriftedAgents  []string    `json:"drifted_agents,omitempty"`
	Duration       Duration    `json:"duration"`
}

// historyLimit bounds the per-agent compliance history retained in memory.
const historyLimit = 100

// FleetManager coordinates discovery, evaluation, drift detection, alerting,
// and history across a fleet of agents. It is safe for concurrent use.
type FleetManager struct {
	cfg     *Config
	metrics *Metrics
	logger  agentLogger

	retryBaseBackoff time.Duration

	mu       sync.Mutex
	baseline map[string]string // agentID → content digest of last scan
	history  map[string][]ComplianceRecord
}

// agentLogger is the minimal logging surface FleetManager depends on, so tests
// can supply a no-op logger without wiring up slog.
type agentLogger interface {
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
	Error(msg string, args ...any)
}

// NewFleetManager constructs a FleetManager from parsed configuration.
func NewFleetManager(cfg *Config, metrics *Metrics, logger agentLogger) *FleetManager {
	if metrics == nil {
		metrics = NewMetrics()
	}
	if logger == nil {
		logger = nopLogger{}
	}
	backoff := defaultRetryBackoff
	return &FleetManager{
		cfg:              cfg,
		metrics:          metrics,
		logger:           logger,
		retryBaseBackoff: backoff,
		baseline:         make(map[string]string),
		history:          make(map[string][]ComplianceRecord),
	}
}

// defaultRetryBackoff is the base delay for the first retry; subsequent
// retries double it (exponential backoff). Kept small so scans recover quickly.
const defaultRetryBackoff = 200 * time.Millisecond

// nopLogger discards all log output. Used as a default and in tests.
type nopLogger struct{}

func (nopLogger) Info(string, ...any)  {}
func (nopLogger) Warn(string, ...any)  {}
func (nopLogger) Error(string, ...any) {}

// WatchAgentRegistries discovers the current set of registered agents, polling
// the configured registry source with exponential backoff (up to MaxRetries).
// It returns the discovered agents and any error after retries are exhausted.
func (fm *FleetManager) WatchAgentRegistries(ctx context.Context) ([]Agent, error) {
	var agents []Agent
	err := fm.withRetry(ctx, func() error {
		discovered, derr := fm.discover(ctx)
		if derr != nil {
			return derr
		}
		agents = discovered
		return nil
	})
	if err != nil {
		return nil, err
	}
	return agents, nil
}

// discover performs a single best-effort registry read: the local directory
// source takes precedence, falling back to the HTTP registry URL.
func (fm *FleetManager) discover(ctx context.Context) ([]Agent, error) {
	if strings.TrimSpace(fm.cfg.RegistryDir) != "" {
		return readAgentsFromDir(fm.cfg.RegistryDir)
	}
	if strings.TrimSpace(fm.cfg.RegistryURL) != "" {
		return fetchAgentsFromURL(ctx, fm.cfg.RegistryURL, fm.cfg.RegistryClient())
	}
	return nil, errors.New("no registry source configured: set registry_dir or registry_url")
}

// withRetry runs op with exponential backoff, up to maxRetries (default 3)
// retries after the initial attempt. It respects ctx cancellation between
// attempts so SIGTERM interrupts pending retries promptly.
func (fm *FleetManager) withRetry(ctx context.Context, op func() error) error {
	max := fm.cfg.MaxRetries
	if max < 1 {
		max = 3
	}
	var lastErr error
	backoff := fm.retryBaseBackoff
	if backoff <= 0 {
		backoff = defaultRetryBackoff
	}
	for attempt := 0; attempt <= max; attempt++ {
		if err := op(); err != nil {
			lastErr = err
			fm.logger.Warn("registry read failed; retrying",
				"attempt", attempt+1, "max_attempts", max+1, "error", err)
			if attempt == max {
				break
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			backoff *= 2
			continue
		}
		return nil
	}
	return fmt.Errorf("registry read failed after %d retries: %w", max, lastErr)
}

// EvaluateAgentCompliance runs every configured rule against a single agent.
// It returns true when the agent satisfies all rules (no violations).
func (fm *FleetManager) EvaluateAgentCompliance(agent Agent) (bool, []Violation) {
	violations := make([]Violation, 0)
	for _, rule := range fm.cfg.Rules {
		ok, detail := evaluateRule(agent, rule)
		fm.metrics.AddCheck()
		if ok {
			continue
		}
		v := Violation{
			AgentID:   agent.ID,
			RuleID:    rule.ID,
			Severity:  rule.Severity,
			CheckType: rule.CheckType,
			Field:     rule.Field,
			Detail:    detail,
		}
		violations = append(violations, v)
		fm.metrics.AddViolation()
		fm.AlertOnViolation(agent, rule, v)
	}
	return len(violations) == 0, violations
}

// AlertOnViolation surfaces a rule violation. For v1 this is structured log
// output (agent_id, rule_id, severity, check_type, field) plus an optional
// webhook POST when webhook_url is configured. Log output is sufficient per the
// issue acceptance criteria.
func (fm *FleetManager) AlertOnViolation(agent Agent, rule ComplianceRule, v Violation) {
	fm.metrics.AddAlert()
	fm.logger.Warn("compliance violation",
		"agent_id", agent.ID,
		"rule_id", rule.ID,
		"check_type", rule.CheckType,
		"field", rule.Field,
		"severity", rule.Severity,
		"detail", v.Detail,
	)
	if strings.TrimSpace(fm.cfg.WebhookURL) == "" {
		return
	}
	// Best-effort webhook delivery; failures are logged but never block the scan.
	go fm.deliverWebhook(v)
}

func (fm *FleetManager) deliverWebhook(v Violation) {
	payload, err := json.Marshal(map[string]any{
		"event":      "compliance_violation",
		"agent_id":   v.AgentID,
		"rule_id":    v.RuleID,
		"severity":   v.Severity,
		"check_type": v.CheckType,
		"field":      v.Field,
		"detail":     v.Detail,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		fm.logger.Error("marshal webhook payload", "error", err)
		return
	}
	req, err := http.NewRequest(http.MethodPost, fm.cfg.WebhookURL, strings.NewReader(string(payload)))
	if err != nil {
		fm.logger.Error("build webhook request", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := fm.cfg.RegistryClient()
	resp, err := client.Do(req)
	if err != nil {
		fm.logger.Error("deliver webhook", "error", err)
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
}

// RunScan performs one complete compliance pass: discover agents, detect drift
// against the previous scan, evaluate each agent, record history, and update
// metrics. Discovery failures are retried by WatchAgentRegistries.
func (fm *FleetManager) RunScan(ctx context.Context) (*ScanReport, error) {
	start := time.Now()
	agents, err := fm.WatchAgentRegistries(ctx)
	if err != nil {
		return nil, err
	}

	report := &ScanReport{StartedAt: start, AgentCount: len(agents)}
	drifted := fm.detectDrift(agents)
	for _, id := range drifted {
		fm.metrics.AddDrift()
		fm.logger.Info("agent drift detected", "agent_id", id)
	}
	report.DriftedAgents = drifted

	for _, agent := range agents {
		compliant, violations := fm.EvaluateAgentCompliance(agent)
		if compliant {
			report.CompliantCount++
		}
		report.Violations = append(report.Violations, violations...)
		fm.recordHistory(agent.ID, compliant, len(violations))
	}

	report.Duration = Duration(time.Since(start))
	fm.metrics.ScanComplete(time.Now())
	return report, nil
}

// detectDrift compares the current fleet against the stored baseline by agent
// content digest and reports agent IDs that are new or changed. The baseline is
// updated to the current snapshot before returning.
func (fm *FleetManager) detectDrift(agents []Agent) []string {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	current := make(map[string]string, len(agents))
	var drifted []string
	for _, agent := range agents {
		digest := agentDigest(agent)
		current[agent.ID] = digest
		if prev, ok := fm.baseline[agent.ID]; !ok || prev != digest {
			// First scan seeds the baseline without flagging every agent as drift.
			if len(fm.baseline) > 0 {
				drifted = append(drifted, agent.ID)
			}
		}
	}
	fm.baseline = current
	sort.Strings(drifted)
	return drifted
}

// recordHistory appends a compliance record for an agent, bounded to the most
// recent historyLimit entries.
func (fm *FleetManager) recordHistory(agentID string, compliant bool, violationCount int) {
	fm.mu.Lock()
	defer fm.mu.Unlock()
	entry := ComplianceRecord{
		Timestamp:      time.Now(),
		Compliant:      compliant,
		ViolationCount: violationCount,
	}
	h := append(fm.history[agentID], entry)
	if len(h) > historyLimit {
		h = h[len(h)-historyLimit:]
	}
	fm.history[agentID] = h
}

// History returns a copy of an agent's retained compliance records.
func (fm *FleetManager) History(agentID string) []ComplianceRecord {
	fm.mu.Lock()
	defer fm.mu.Unlock()
	src := fm.history[agentID]
	out := make([]ComplianceRecord, len(src))
	copy(out, src)
	return out
}

// ---- registry sources ----

// readAgentsFromDir loads one Agent per *.json file under dir (non-recursive).
// Files that fail to parse are skipped with a best-effort read; an absent
// directory yields an empty slice, not an error.
func readAgentsFromDir(dir string) ([]Agent, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read registry dir %s: %w", dir, err)
	}
	var agents []Agent
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var agent Agent
		if err := json.Unmarshal(raw, &agent); err != nil {
			continue
		}
		if agent.ID == "" {
			agent.ID = strings.TrimSuffix(entry.Name(), ".json")
		}
		agents = append(agents, agent)
	}
	return agents, nil
}

// fetchAgentsFromURL expects the URL to return a JSON array of Agent objects
// (as published by the registry service or any compatible agent directory).
func fetchAgentsFromURL(ctx context.Context, url string, client *http.Client) ([]Agent, error) {
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build registry request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch registry: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("registry returned %s", resp.Status)
	}
	var agents []Agent
	if err := json.NewDecoder(resp.Body).Decode(&agents); err != nil {
		return nil, fmt.Errorf("decode registry response: %w", err)
	}
	return agents, nil
}

// ---- rule evaluation ----

// evaluateRule applies a single rule to an agent and returns whether the rule
// is satisfied. A non-empty detail string explains why it failed (or why the
// rule was malformed).
func evaluateRule(agent Agent, rule ComplianceRule) (bool, string) {
	actual, present := resolveField(agent, rule.Field)
	switch rule.Operator {
	case "exists":
		return present && actual != "", ""
	case "not_exists":
		return !present || actual == "", ""
	case "eq":
		return present && actual == rule.Threshold, ""
	case "ne":
		return !present || actual != rule.Threshold, ""
	case "contains":
		return present && tokenContains(actual, rule.Threshold), ""
	case "not_contains":
		return !present || !tokenContains(actual, rule.Threshold), ""
	case "in":
		return present && listContains(csvList(rule.Threshold), actual), ""
	case "not_in":
		return !present || !listContains(csvList(rule.Threshold), actual), ""
	case "gte", "lte", "gt", "lt":
		if !present {
			return false, ""
		}
		return numericCompare(actual, rule.Operator, rule.Threshold)
	default:
		return false, fmt.Sprintf("unsupported operator %q", rule.Operator)
	}
}

// resolveField looks up a rule field on an agent, returning the string form of
// the value and whether the field is present. List fields are joined with ","
// so contains/not_contains/in can match membership.
func resolveField(agent Agent, field string) (string, bool) {
	switch field {
	case "agent_id":
		return agent.ID, agent.ID != ""
	case "name":
		return agent.Name, agent.Name != ""
	case "identity":
		return agent.Identity, agent.Identity != ""
	case "version":
		return agent.Version, agent.Version != ""
	case "signed":
		return strconv.FormatBool(agent.Signed), true
	case "max_severity":
		return agent.MaxSeverity, agent.MaxSeverity != ""
	case "permissions":
		return strings.Join(agent.Permissions, ","), len(agent.Permissions) > 0
	case "permissions.count":
		return strconv.Itoa(len(agent.Permissions)), true
	case "tools.count":
		return strconv.Itoa(len(agent.Tools)), true
	}
	if strings.HasPrefix(field, "attr.") {
		v, ok := agent.Attributes[strings.TrimPrefix(field, "attr.")]
		return v, ok
	}
	return "", false
}

// numericCompare handles gte/lte/gt/lt by first trying severity rank (so
// "max_severity" rules read naturally), then falling back to float comparison.
func numericCompare(actual, op, threshold string) (bool, string) {
	if aRank, ok := severityRank[actual]; ok {
		if tRank, ok2 := severityRank[threshold]; ok2 {
			return compareOrdered(aRank, op, tRank), ""
		}
	}
	a, errA := strconv.ParseFloat(actual, 64)
	t, errT := strconv.ParseFloat(threshold, 64)
	if errA != nil || errT != nil {
		return false, fmt.Sprintf("cannot compare %q and %q numerically", actual, threshold)
	}
	return compareOrdered(a, op, t), ""
}

// compareOrdered applies a comparison operator to two ordered values.
func compareOrdered[T int | float64](actual T, op string, threshold T) bool {
	switch op {
	case "gte":
		return actual >= threshold
	case "lte":
		return actual <= threshold
	case "gt":
		return actual > threshold
	case "lt":
		return actual < threshold
	}
	return false
}

// tokenContains reports whether the comma-joined field value contains a
// permission/token substring (e.g. permissions containing "admin:").
func tokenContains(joined, needle string) bool {
	if needle == "" {
		return false
	}
	for _, tok := range strings.Split(joined, ",") {
		if strings.Contains(tok, needle) {
			return true
		}
	}
	return false
}

// csvList splits a comma-separated threshold into trimmed tokens.
func csvList(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func listContains(list []string, v string) bool {
	for _, item := range list {
		if item == v {
			return true
		}
	}
	return false
}

// agentDigest returns a stable SHA-256 digest of an agent's compliance-relevant
// fields, used for drift detection between scans.
func agentDigest(agent Agent) string {
	payload, err := json.Marshal(struct {
		ID          string
		Identity    string
		Version     string
		Signed      bool
		MaxSeverity string
		Permissions []string
		Tools       []AgentTool
	}{
		ID: agent.ID, Identity: agent.Identity, Version: agent.Version,
		Signed: agent.Signed, MaxSeverity: agent.MaxSeverity,
		Permissions: agent.Permissions, Tools: agent.Tools,
	})
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}
