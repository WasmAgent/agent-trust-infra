package main

// Benchmark suite for the policy-engine validation operations (issue #232,
// Milestone 8 — Performance benchmarks and SLIs).
//
// This file ships an automated, CLI-driven benchmark suite that measures
// throughput (ops/s) and latency (ns/op, p50/p95/p99) for the core validation
// operations defined in the trust-policy-engine package:
//
//   - ValidatePolicy       — structural policy validation
//   - ComposePolicyRules   — policy composition across nested includes
//   - EvaluateCondition    — single condition evaluation
//   - ValuesAtPath         — JSON path resolution
//   - EvaluatePolicy       — full policy evaluation against an artifact
//
// Run the suite via the `bench` subcommand to publish results:
//
//	policy-engine bench                       # all workloads, JSON to stdout
//	policy-engine bench -workload large       # a single workload
//	policy-engine bench -results out.json     # also publish JSON to a file
//	policy-engine bench -iterations 5000      # override iteration count
//
// The published JSON document feeds the SLO regression baseline described in
// docs/slo-guidance.md (§4.3 baseline procedure, §8.1 regression table).

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"runtime"
	"sort"
	"time"

	"github.com/WasmAgent/agent-trust-infra/trust-policy-engine"
)

// benchSubcommand is the leading positional token that selects benchmark mode
// in run(). Declared here so main.go can dispatch without importing a name from
// a _test.go file.
const benchSubcommand = "bench"

// Workload identifiers. Each workload grows the policy + artifact so the suite
// reports how validation cost scales with input size.
const (
	benchWorkloadAll    = "all"
	benchWorkloadSmall  = "small"
	benchWorkloadMedium = "medium"
	benchWorkloadLarge  = "large"
)

// benchIterationsPerWorkload is the default operation count per measurement.
// Smaller workloads run more iterations because each op is cheaper; this keeps
// every workload in a stable, sub-second band while collecting enough samples
// for robust percentile estimates.
var benchIterationsPerWorkload = map[string]int{
	benchWorkloadSmall:  100_000,
	benchWorkloadMedium: 10_000,
	benchWorkloadLarge:  1_000,
}

// benchSampleCap bounds the per-operation percentile sample. Sampling a subset
// (rather than every iteration) keeps memory predictable for the tiny, hot
// operations without distorting the batch-throughput figure.
const benchSampleCap = 10_000

// Operation labels measured by the suite. Keep in sync with the dispatch in
// runValidationBenchmarksIter.
const (
	benchOpValidatePolicy     = "validate_policy"
	benchOpComposePolicyRules = "compose_policy_rules"
	benchOpEvaluateCondition  = "evaluate_condition"
	benchOpValuesAtPath       = "values_at_path"
	benchOpEvaluatePolicy     = "evaluate_policy"
)

// benchMetric is one published measurement. This struct is the shape written to
// stdout and the -results file and consumed by the SLO regression baseline.
type benchMetric struct {
	Operation           string  `json:"operation"`
	Workload            string  `json:"workload"`
	Iterations          int     `json:"iterations"`
	TotalDurationNs     int64   `json:"total_duration_ns"`
	AvgLatencyNsPerOp   float64 `json:"avg_latency_ns_per_op"`
	P50LatencyNs        float64 `json:"p50_latency_ns"`
	P95LatencyNs        float64 `json:"p95_latency_ns"`
	P99LatencyNs        float64 `json:"p99_latency_ns"`
	ThroughputOpsPerSec float64 `json:"throughput_ops_per_sec"`
}

// benchReport is the top-level published document.
type benchReport struct {
	Timestamp string        `json:"timestamp"`
	GoVersion string        `json:"go_version"`
	Metrics   []benchMetric `json:"metrics"`
}

// runBenchCommand implements `policy-engine bench`. It parses benchmark
// options, runs the validation benchmark suite across the requested workloads,
// and publishes the results as JSON to stdout (and optionally a file).
func runBenchCommand(args []string, stdout, stderr io.Writer) (int, error) {
	flags := flag.NewFlagSet("bench", flag.ContinueOnError)
	flags.SetOutput(stderr)

	workload := flags.String("workload", benchWorkloadAll, "workload size: small, medium, large, or all")
	iterations := flags.Int("iterations", 0, "operations per measurement (0 = workload default)")
	resultsPath := flags.String("results", "", "also write published JSON results to this path")

	if err := flags.Parse(args); err != nil {
		return 2, err
	}

	workloads, err := resolveBenchWorkloads(*workload)
	if err != nil {
		return 2, err
	}

	report := benchReport{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		GoVersion: runtime.Version(),
		Metrics:   []benchMetric{},
	}
	for _, w := range workloads {
		metrics, err := runValidationBenchmarksIter(w, *iterations)
		if err != nil {
			return 2, err
		}
		report.Metrics = append(report.Metrics, metrics...)
	}

	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		return 2, fmt.Errorf("encode benchmark report: %w", err)
	}

	if *resultsPath != "" {
		if err := publishBenchReportFile(*resultsPath, report); err != nil {
			return 2, err
		}
		fmt.Fprintf(stderr, "published benchmark results to %s\n", *resultsPath)
	}
	return 0, nil
}

// resolveBenchWorkloads maps the -workload flag to the ordered workload list.
func resolveBenchWorkloads(workload string) ([]string, error) {
	switch workload {
	case benchWorkloadAll:
		return []string{benchWorkloadSmall, benchWorkloadMedium, benchWorkloadLarge}, nil
	case benchWorkloadSmall, benchWorkloadMedium, benchWorkloadLarge:
		return []string{workload}, nil
	default:
		return nil, fmt.Errorf("unsupported -workload %q (want small, medium, large, or all)", workload)
	}
}

// publishBenchReportFile writes the report to disk so it can be committed as a
// regression baseline or attached to a CI artifact.
func publishBenchReportFile(path string, report benchReport) error {
	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create benchmark results file: %w", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		return fmt.Errorf("encode benchmark results file: %w", err)
	}
	return nil
}

// runValidationBenchmarks runs a workload with its default iteration count.
func runValidationBenchmarks(workload string) ([]benchMetric, error) {
	return runValidationBenchmarksIter(workload, benchIterationsPerWorkload[workload])
}

// runValidationBenchmarksIter measures every validation operation against one
// workload. iterations<=0 falls back to the workload default. Fixtures are
// validated once up front so a broken generator fails the run loudly rather
// than silently publishing numbers for invalid input.
func runValidationBenchmarksIter(workload string, iterations int) ([]benchMetric, error) {
	if iterations <= 0 {
		iterations = benchIterationsPerWorkload[workload]
	}
	if iterations <= 0 {
		return nil, fmt.Errorf("no default iterations for workload %q", workload)
	}

	policy := benchPolicyDocument(workload)
	artifact := benchArtifact(workload)

	if err := trustpolicyengine.ValidatePolicy(policy); err != nil {
		return nil, fmt.Errorf("bench policy %s invalid: %w", workload, err)
	}
	if _, err := trustpolicyengine.EvaluatePolicy(policy, artifact); err != nil {
		return nil, fmt.Errorf("bench evaluation %s failed: %w", workload, err)
	}

	// Representative condition + path reused across the hot loops. Values is a
	// fixed non-nil slice and Value is unset, so EvaluateCondition performs no
	// backing-array mutation across iterations.
	containsCond := trustpolicyengine.Condition{
		Path:   "tools[].permissions[]",
		Op:     "contains",
		Values: []string{"filesystem"},
	}
	permissionsPath := "tools[].permissions[]"

	return []benchMetric{
		bench(benchOpValidatePolicy, workload, iterations, func() {
			_ = trustpolicyengine.ValidatePolicy(policy)
		}),
		bench(benchOpComposePolicyRules, workload, iterations, func() {
			_ = trustpolicyengine.ComposePolicyRules(policy)
		}),
		bench(benchOpEvaluateCondition, workload, iterations, func() {
			_, _ = trustpolicyengine.EvaluateCondition(containsCond, artifact)
		}),
		bench(benchOpValuesAtPath, workload, iterations, func() {
			_, _ = trustpolicyengine.ValuesAtPath(artifact, permissionsPath)
		}),
		bench(benchOpEvaluatePolicy, workload, iterations, func() {
			_, _ = trustpolicyengine.EvaluatePolicy(policy, artifact)
		}),
	}, nil
}

// bench measures one operation and returns its published metric.
func bench(op, workload string, iterations int, fn func()) benchMetric {
	return metricFromTiming(op, workload, measure(iterations, fn))
}

// benchTiming holds the raw outputs of measure.
type benchTiming struct {
	Iterations int
	Total      time.Duration
	P50        time.Duration
	P95        time.Duration
	P99        time.Duration
}

// measure times fn two ways: a batch pass for honest throughput (no per-call
// instrumentation in the hot loop), then a bounded sample pass for percentile
// latency. The two-pass split prevents time.Now overhead from dominating the
// throughput figure for sub-microsecond operations.
func measure(iterations int, fn func()) benchTiming {
	if iterations < 1 {
		iterations = 1
	}

	batchStart := time.Now()
	for i := 0; i < iterations; i++ {
		fn()
	}
	total := time.Since(batchStart)

	sampleCount := iterations
	if sampleCount > benchSampleCap {
		sampleCount = benchSampleCap
	}
	samples := make([]time.Duration, 0, sampleCount)
	for i := 0; i < sampleCount; i++ {
		callStart := time.Now()
		fn()
		samples = append(samples, time.Since(callStart))
	}
	sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })

	return benchTiming{
		Iterations: iterations,
		Total:      total,
		P50:        percentileDur(samples, 0.50),
		P95:        percentileDur(samples, 0.95),
		P99:        percentileDur(samples, 0.99),
	}
}

// metricFromTiming converts raw timing into a publishable metric.
func metricFromTiming(op, workload string, t benchTiming) benchMetric {
	avgNs := float64(t.Total.Nanoseconds()) / float64(t.Iterations)
	throughput := 0.0
	if t.Total > 0 {
		throughput = float64(t.Iterations) / t.Total.Seconds()
	}
	return benchMetric{
		Operation:           op,
		Workload:            workload,
		Iterations:          t.Iterations,
		TotalDurationNs:     t.Total.Nanoseconds(),
		AvgLatencyNsPerOp:   avgNs,
		P50LatencyNs:        float64(t.P50.Nanoseconds()),
		P95LatencyNs:        float64(t.P95.Nanoseconds()),
		P99LatencyNs:        float64(t.P99.Nanoseconds()),
		ThroughputOpsPerSec: throughput,
	}
}

// percentileDur returns the p-th percentile from an already-sorted slice using
// the nearest-rank method (ceil(p·n)−1), matching the SLO guidance percentile
// convention.
func percentileDur(sorted []time.Duration, p float64) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(math.Ceil(p*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

// benchPolicyDocument builds a valid policy whose rule count and include depth
// scale with the workload. Every rule is a non-matching `warn` so evaluation
// walks the full condition path without short-circuiting on violations.
func benchPolicyDocument(workload string) trustpolicyengine.PolicyDocument {
	mainRules, baselineRules := benchWorkloadRuleCounts(workload)
	policy := trustpolicyengine.PolicyDocument{
		DSLVersion:  trustpolicyengine.SupportedDSLVersion,
		PolicySetID: "bench-" + workload,
		Version:     "1.0.0",
		Rules:       benchRules(mainRules, workload, 0),
	}
	if baselineRules > 0 {
		policy.Includes = []trustpolicyengine.PolicyDocument{{
			DSLVersion:  trustpolicyengine.SupportedDSLVersion,
			PolicySetID: "bench-" + workload + "-baseline",
			Version:     "1.0.0",
			Rules:       benchRules(baselineRules, workload, mainRules),
		}}
	}
	return policy
}

// benchWorkloadRuleCounts returns (main policy rules, included baseline rules)
// per workload. Keeping includes to a single level avoids exponential rule
// blow-up while still exercising ComposePolicyRules and countPolicyDocuments.
func benchWorkloadRuleCounts(workload string) (main, baseline int) {
	switch workload {
	case benchWorkloadSmall:
		return 2, 0
	case benchWorkloadMedium:
		return 10, 5
	case benchWorkloadLarge:
		return 50, 20
	default:
		return 2, 0
	}
}

// benchRules generates count non-matching warn rules. offset seeds the rule ID
// so included policies get distinct, deterministic names.
func benchRules(count int, workload string, offset int) []trustpolicyengine.PolicyRule {
	rules := make([]trustpolicyengine.PolicyRule, count)
	for i := 0; i < count; i++ {
		idx := offset + i
		rules[i] = trustpolicyengine.PolicyRule{
			ID:          fmt.Sprintf("bench-%s-rule-%d", workload, idx),
			Description: fmt.Sprintf("benchmark %s rule %d", workload, idx),
			Effect:      "warn",
			When: &trustpolicyengine.Condition{
				Path:  fmt.Sprintf("tags[%d]", idx%4),
				Op:    "equals",
				Value: fmt.Sprintf("no-match-%d", idx),
			},
		}
	}
	return rules
}

// benchArtifact builds an artifact whose server/tool/tag counts scale with the
// workload, exercising array path resolution (servers[].server_id,
// tools[].permissions[]) and nested objects (evidence_layer, passport).
func benchArtifact(workload string) map[string]any {
	size := map[string]int{
		benchWorkloadSmall:  2,
		benchWorkloadMedium: 10,
		benchWorkloadLarge:  50,
	}[workload]

	servers := make([]any, 0, size)
	tools := make([]any, 0, size)
	for i := 0; i < size; i++ {
		servers = append(servers, map[string]any{
			"server_id": fmt.Sprintf("server-%d", i%3),
		})
		tools = append(tools, map[string]any{
			"tool_id":     fmt.Sprintf("tool-%d", i),
			"permissions": []string{"filesystem:read", "network:GET", "shell:exec"},
		})
	}
	return map[string]any{
		"agent_id": "bench-agent",
		"servers":  servers,
		"tools":    tools,
		"evidence_layer": map[string]any{
			"aep_references": []string{"aep://audit/1", "aep://audit/2"},
		},
		"passport": map[string]any{"expires_at": "2026-12-31T00:00:00Z"},
		"tags":     []string{"alpha", "beta", "gamma", "delta"},
	}
}