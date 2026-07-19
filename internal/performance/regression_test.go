package performance

import (
	"encoding/json"
	"testing"
	"time"
)

// --- Framework correctness tests ---

func TestMeasureRunsCorrectIterationCount(t *testing.T) {
	th := Threshold{
		Name:        "test-iteration-count",
		MaxDuration: 0,
		WarmupRuns:  3,
		MeasureRuns: 7,
	}
	count := 0
	Measure(th, func() { count++ })
	if count != th.WarmupRuns+th.MeasureRuns {
		t.Fatalf("expected %d total calls, got %d", th.WarmupRuns+th.MeasureRuns, count)
	}
}

func TestMeasureReturnsNonNegativeMedian(t *testing.T) {
	th := Threshold{
		Name:        "test-non-negative",
		MaxDuration: 0,
		WarmupRuns:  1,
		MeasureRuns: 3,
	}
	med := Measure(th, func() {})
	if med < 0 {
		t.Fatalf("median should be >= 0, got %v", med)
	}
}

func TestMedianEvenCount(t *testing.T) {
	durations := []time.Duration{3, 1, 2, 4}
	med := median(durations)
	if med != 2 {
		t.Fatalf("median of [3,1,2,4] = %d, want 2", med)
	}
}

func TestMedianOddCount(t *testing.T) {
	durations := []time.Duration{5, 1, 3}
	med := median(durations)
	if med != 3 {
		t.Fatalf("median of [5,1,3] = %d, want 3", med)
	}
}

func TestMedianSingleElement(t *testing.T) {
	durations := []time.Duration{42}
	med := median(durations)
	if med != 42 {
		t.Fatalf("median of [42] = %d, want 42", med)
	}
}

// --- CheckRegression behaviour tests ---

func TestCheckRegressionPassesWithinThreshold(t *testing.T) {
	th := Threshold{
		Name:        "test-pass-within-threshold",
		MaxDuration: 1<<63 - 1,
		WarmupRuns:  1,
		MeasureRuns: 1,
	}
	t.Run("fast-op", func(t *testing.T) {
		CheckRegression(t, th, func() {})
	})
}

func TestCheckRegressionDetectsSlowOperation(t *testing.T) {
	th := Threshold{
		Name:        "test-detect-slow",
		MaxDuration: 1, // 1 nanosecond — any real operation exceeds this
		WarmupRuns:  1,
		MeasureRuns: 1,
	}
	// Verify Measure returns a duration exceeding the threshold,
	// confirming the detection condition that CheckRegression checks.
	med := Measure(th, func() {})
	if med <= th.MaxDuration {
		t.Fatalf("expected median %v to exceed 1ns threshold", med)
	}
}

// --- ThresholdFor tests ---

func TestThresholdForPanicsOnUnknown(t *testing.T) {
	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("ThresholdFor should panic for unknown threshold name")
		}
	}()
	ThresholdFor("nonexistent-threshold")
}

func TestThresholdForReturnsKnown(t *testing.T) {
	th := ThresholdFor("json-parse-small-policy")
	if th.MaxDuration == 0 {
		t.Fatal("expected non-zero MaxDuration")
	}
	if th.Name != "json-parse-small-policy" {
		t.Fatalf("Name = %q, want %q", th.Name, "json-parse-small-policy")
	}
}

// --- Regression gate tests ---
// These run as regular tests so `go test` catches performance regressions
// without requiring `-bench`.

func TestRegressionJSONParseSmallPolicy(t *testing.T) {
	data, err := json.Marshal(buildSamplePolicy(1))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	CheckRegression(t, ThresholdFor("json-parse-small-policy"), func() {
		var v any
		if err := json.Unmarshal(data, &v); err != nil {
			t.Fatal(err)
		}
	})
}

func TestRegressionJSONParseMediumPolicy(t *testing.T) {
	data, err := json.Marshal(buildSamplePolicy(50))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	CheckRegression(t, ThresholdFor("json-parse-medium-policy"), func() {
		var v any
		if err := json.Unmarshal(data, &v); err != nil {
			t.Fatal(err)
		}
	})
}

func TestRegressionJSONEncodeResult(t *testing.T) {
	result := map[string]any{
		"policy_set_id": "bench",
		"version":       "1.0.0",
		"allowed":       true,
		"violations":     []any{},
		"warnings":      []any{},
		"passed_rules":   []string{"rule-0001", "rule-0002", "rule-0003"},
		"metadata": map[string]int{
			"policy_sets_composed": 1,
			"rules_evaluated":      3,
			"rules_passed":         3,
		},
	}
	CheckRegression(t, ThresholdFor("json-encode-result"), func() {
		if _, err := json.Marshal(result); err != nil {
			t.Fatal(err)
		}
	})
}
