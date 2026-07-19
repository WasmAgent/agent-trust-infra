package performance

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func BenchmarkMeasure(b *testing.B) {
	th := Threshold{
		Name:        "bench-measure",
		MaxDuration: 1<<63 - 1,
		WarmupRuns:  10,
		MeasureRuns: 10,
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Measure(th, func() {})
	}
}

func BenchmarkMedianSort(b *testing.B) {
	durations := make([]time.Duration, 1000)
	for i := range durations {
		durations[i] = time.Duration(i%100) * time.Nanosecond
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = median(durations)
	}
}

// buildSamplePolicy generates a JSON-serializable policy document with n rules.
func buildSamplePolicy(n int) map[string]any {
	rules := make([]map[string]any, n)
	for i := 0; i < n; i++ {
		rules[i] = map[string]any{
			"id":     fmt.Sprintf("rule-%04d", i),
			"effect": "deny",
			"when": map[string]any{
				"path": fmt.Sprintf("tools[%d].permissions[]", i%10),
				"op":   "contains",
				"value": "filesystem",
			},
		}
	}
	return map[string]any{
		"policy_set_id": "bench-policy",
		"version":       "1.0.0",
		"rules":         rules,
	}
}

// buildSampleArtifact generates a JSON-serializable artifact with n tools.
func buildSampleArtifact(n int) map[string]any {
	tools := make([]map[string]any, n)
	for i := range tools {
		tools[i] = map[string]any{
			"tool_id":     fmt.Sprintf("tool-%04d", i),
			"permissions": []string{"filesystem:read", "network:write"},
		}
	}
	return map[string]any{
		"tools": tools,
	}
}

func BenchmarkJSONParseSmallPolicy(b *testing.B) {
	data, _ := json.Marshal(buildSamplePolicy(1))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var v any
		if err := json.Unmarshal(data, &v); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkJSONParseMediumPolicy(b *testing.B) {
	data, _ := json.Marshal(buildSamplePolicy(50))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var v any
		if err := json.Unmarshal(data, &v); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkJSONParseLargePolicy(b *testing.B) {
	data, _ := json.Marshal(buildSamplePolicy(500))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var v any
		if err := json.Unmarshal(data, &v); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkJSONMarshalResult(b *testing.B) {
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
			"violations":           0,
			"warnings":             0,
		},
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := json.Marshal(result); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkJSONParseSmallArtifact(b *testing.B) {
	data, _ := json.Marshal(buildSampleArtifact(1))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var v any
		if err := json.Unmarshal(data, &v); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkJSONParseMediumArtifact(b *testing.B) {
	data, _ := json.Marshal(buildSampleArtifact(50))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var v any
		if err := json.Unmarshal(data, &v); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkJSONParseLargeArtifact(b *testing.B) {
	data, _ := json.Marshal(buildSampleArtifact(500))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var v any
		if err := json.Unmarshal(data, &v); err != nil {
			b.Fatal(err)
		}
	}
}
