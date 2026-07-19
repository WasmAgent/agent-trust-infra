// Package performance provides a framework for measuring operation latency
// and detecting performance regressions in automated tests.
//
// Regression tests use [CheckRegression] to compare measured median latency
// against a configurable [Threshold]. When the median exceeds the threshold
// the test fails, signalling that a code change introduced a slowdown.
//
// Benchmarks ([BenchmarkXxx]) use the standard Go testing.B infrastructure
// for fine-grained throughput/latency analysis via `go test -bench`.
package performance

import (
	"fmt"
	"testing"
	"time"
)

// Threshold defines an acceptable time budget for a single operation.
// Regression tests compare measured median latency against MaxDuration.
type Threshold struct {
	Name        string        // human-readable label, used in failure messages
	MaxDuration time.Duration // acceptable upper bound for median latency
	WarmupRuns  int           // iterations to warm CPU caches (default 100)
	MeasureRuns int           // iterations used to compute median (default 1000)
}

// DefaultThresholds contains pre-defined thresholds for standard operations.
// Tests can use these directly via [ThresholdFor] or define custom thresholds.
var DefaultThresholds = map[string]Threshold{
	"json-parse-small-policy": {
		Name:        "json-parse-small-policy",
		MaxDuration: 10 * time.Microsecond,
		WarmupRuns:  50,
		MeasureRuns: 500,
	},
	"json-parse-medium-policy": {
		Name:        "json-parse-medium-policy",
		MaxDuration: 200 * time.Microsecond,
		WarmupRuns:  50,
		MeasureRuns: 500,
	},
	"json-encode-result": {
		Name:        "json-encode-result",
		MaxDuration: 5 * time.Microsecond,
		WarmupRuns:  50,
		MeasureRuns: 500,
	},
	"path-resolution-shallow": {
		Name:        "path-resolution-shallow",
		MaxDuration: 1 * time.Microsecond,
		WarmupRuns:  100,
		MeasureRuns: 1000,
	},
	"path-resolution-deep": {
		Name:        "path-resolution-deep",
		MaxDuration: 5 * time.Microsecond,
		WarmupRuns:  100,
		MeasureRuns: 1000,
	},
}

// Measure runs fn multiple times and returns the median duration.
// Warmup runs are executed first to prime CPU caches.
func Measure(th Threshold, fn func()) time.Duration {
	warmup := th.WarmupRuns
	if warmup <= 0 {
		warmup = 100
	}
	for i := 0; i < warmup; i++ {
		fn()
	}

	measure := th.MeasureRuns
	if measure <= 0 {
		measure = 1000
	}
	durations := make([]time.Duration, measure)
	for i := 0; i < measure; i++ {
		start := time.Now()
		fn()
		durations[i] = time.Since(start)
	}
	return median(durations)
}

// median returns the median of a slice of durations using insertion sort
// (fast for the small N typical of regression measurements).
func median(durations []time.Duration) time.Duration {
	sorted := make([]time.Duration, len(durations))
	copy(sorted, durations)
	for i := 1; i < len(sorted); i++ {
		key := sorted[i]
		j := i - 1
		for j >= 0 && sorted[j] > key {
			sorted[j+1] = sorted[j]
			j--
		}
		sorted[j+1] = key
	}
	mid := len(sorted) / 2
	if len(sorted)%2 == 0 {
		return (sorted[mid-1] + sorted[mid]) / 2
	}
	return sorted[mid]
}

// CheckRegression runs fn through Measure and fails the test if the median
// duration exceeds the threshold's MaxDuration.
func CheckRegression(t *testing.T, th Threshold, fn func()) {
	t.Helper()
	med := Measure(th, fn)
	if med > th.MaxDuration {
		t.Errorf("regression detected: %s median latency %v exceeds threshold %v",
			th.Name, med, th.MaxDuration)
	}
}

// ThresholdFor returns the named threshold from DefaultThresholds.
// It panics if no threshold with that name exists.
func ThresholdFor(name string) Threshold {
	th, ok := DefaultThresholds[name]
	if !ok {
		panic(fmt.Sprintf("performance: unknown threshold %q", name))
	}
	return th
}
