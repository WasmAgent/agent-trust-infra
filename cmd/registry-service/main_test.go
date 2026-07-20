package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// mustMarshalJSON serialises v to JSON, failing the test on error.
func mustMarshalJSON(t *testing.T, v interface{}) []byte {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return data
}

// newTestServer creates a Registry backed by t.TempDir() and an httptest.Server.
// The server is closed automatically when the test finishes.
func newTestServer(t *testing.T) (*Registry, *httptest.Server) {
	t.Helper()
	reg, err := NewRegistry(t.TempDir())
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	srv := httptest.NewServer(NewRouter(reg))
	t.Cleanup(srv.Close)
	return reg, srv
}

func TestHealth(t *testing.T) {
	_, srv := newTestServer(t)

	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var health HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if health.Status != "ok" {
		t.Errorf("status = %q, want \"ok\"", health.Status)
	}
	if health.Version == "" {
		t.Error("version is empty, want non-empty")
	}
}

func TestPublishAndPull(t *testing.T) {
	_, srv := newTestServer(t)

	artifact := map[string]interface{}{
		"agentbom_version": "0.1",
		"agent":            map[string]interface{}{"name": "test-agent"},
	}

	body := mustMarshalJSON(t, PublishRequest{
		Artifact: mustMarshalJSON(t, artifact),
		Tag:      "latest",
	})
	resp, err := http.Post(srv.URL+"/v1/artifacts", "application/json", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", resp.StatusCode)
	}

	var pubResp PublishResponse
	if err := json.NewDecoder(resp.Body).Decode(&pubResp); err != nil {
		t.Fatalf("decode publish response: %v", err)
	}
	if !strings.HasPrefix(pubResp.CasID, "sha256:") {
		t.Errorf("cas_id = %q, want sha256: prefix", pubResp.CasID)
	}
	if pubResp.ArtifactType != "agentbom" {
		t.Errorf("artifact_type = %q, want \"agentbom\"", pubResp.ArtifactType)
	}
	if pubResp.Deduplicated {
		t.Error("deduplicated = true on first publish, want false")
	}
	if pubResp.Version < 1 {
		t.Errorf("version = %d, want >= 1", pubResp.Version)
	}
	if pubResp.Tag != "latest" {
		t.Errorf("tag = %q, want \"latest\"", pubResp.Tag)
	}

	// Pull by CAS ID
	resp2, err := http.Get(srv.URL + "/v1/artifacts/" + pubResp.CasID)
	if err != nil {
		t.Fatalf("GET artifact: %v", err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp2.StatusCode)
	}

	var artResp ArtifactResponse
	if err := json.NewDecoder(resp2.Body).Decode(&artResp); err != nil {
		t.Fatalf("decode pull response: %v", err)
	}
	if artResp.CasID != pubResp.CasID {
		t.Errorf("cas_id = %q, want %q", artResp.CasID, pubResp.CasID)
	}
	if !artResp.IntegrityVerified {
		t.Error("integrity_verified = false, want true")
	}
	if artResp.ArtifactType != "agentbom" {
		t.Errorf("artifact_type = %q, want \"agentbom\"", artResp.ArtifactType)
	}

	// Verify artifact content is preserved
	var pulled map[string]interface{}
	if err := json.Unmarshal(artResp.Artifact, &pulled); err != nil {
		t.Fatalf("unmarshal pulled artifact: %v", err)
	}
	if pulled["agentbom_version"] != "0.1" {
		t.Errorf("agentbom_version = %v, want \"0.1\"", pulled["agentbom_version"])
	}
}

func TestPublishDeduplication(t *testing.T) {
	_, srv := newTestServer(t)

	artifact := map[string]interface{}{"agentbom_version": "0.1"}
	body := mustMarshalJSON(t, PublishRequest{Artifact: mustMarshalJSON(t, artifact)})

	// First publish
	resp1, err := http.Post(srv.URL+"/v1/artifacts", "application/json", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("POST 1: %v", err)
	}
	defer resp1.Body.Close()
	if resp1.StatusCode != http.StatusCreated {
		t.Fatalf("status 1 = %d, want 201", resp1.StatusCode)
	}

	var pub1 PublishResponse
	if err := json.NewDecoder(resp1.Body).Decode(&pub1); err != nil {
		t.Fatalf("decode 1: %v", err)
	}

	// Second publish — same content → deduplicated
	resp2, err := http.Post(srv.URL+"/v1/artifacts", "application/json", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("POST 2: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusCreated {
		t.Fatalf("status 2 = %d, want 201", resp2.StatusCode)
	}

	var pub2 PublishResponse
	if err := json.NewDecoder(resp2.Body).Decode(&pub2); err != nil {
		t.Fatalf("decode 2: %v", err)
	}

	if pub2.CasID != pub1.CasID {
		t.Errorf("second cas_id = %q, want %q (same content → same CAS)", pub2.CasID, pub1.CasID)
	}
	if !pub2.Deduplicated {
		t.Error("deduplicated = false on duplicate publish, want true")
	}
	if pub2.Version != pub1.Version {
		t.Errorf("second version = %d, want %d (immutable)", pub2.Version, pub1.Version)
	}
}

func TestPullNotFound(t *testing.T) {
	_, srv := newTestServer(t)

	fakeID := "sha256:" + strings.Repeat("ff", 32)
	resp, err := http.Get(srv.URL + "/v1/artifacts/" + fakeID)
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}

	var errResp ErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&errResp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if !strings.Contains(errResp.Error, fakeID) {
		t.Errorf("error = %q, want to contain cas_id", errResp.Error)
	}
}

func TestQueryByAgent(t *testing.T) {
	_, srv := newTestServer(t)

	// Publish two artifacts for the same agent
	for i := 0; i < 2; i++ {
		artifact := map[string]interface{}{
			"agentbom_version": "0.1",
			"name":             fmt.Sprintf("agent-a-v%d", i+1),
		}
		body := mustMarshalJSON(t, PublishRequest{
			Artifact:      mustMarshalJSON(t, artifact),
			AgentIdentity: "my-agent",
		})
		resp, err := http.Post(srv.URL+"/v1/artifacts", "application/json", strings.NewReader(string(body)))
		if err != nil {
			t.Fatalf("POST %d: %v", i+1, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("status %d = %d, want 201", i+1, resp.StatusCode)
		}
	}

	// Query by agent
	resp, err := http.Get(srv.URL + "/v1/agents/my-agent/artifacts")
	if err != nil {
		t.Fatalf("GET agent: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var agentResp AgentArtifactsResponse
	if err := json.NewDecoder(resp.Body).Decode(&agentResp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if agentResp.AgentIdentity != "my-agent" {
		t.Errorf("agent_identity = %q, want \"my-agent\"", agentResp.AgentIdentity)
	}
	if len(agentResp.Artifacts) != 2 {
		t.Fatalf("len(artifacts) = %d, want 2", len(agentResp.Artifacts))
	}
	for _, a := range agentResp.Artifacts {
		if a.ArtifactType != "agentbom" {
			t.Errorf("artifact_type = %q, want \"agentbom\"", a.ArtifactType)
		}
		if a.CasID == "" {
			t.Error("cas_id is empty")
		}
	}
}

func TestQueryAgentEmpty(t *testing.T) {
	_, srv := newTestServer(t)

	resp, err := http.Get(srv.URL + "/v1/agents/nonexistent/artifacts")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200 (empty list)", resp.StatusCode)
	}

	var agentResp AgentArtifactsResponse
	if err := json.NewDecoder(resp.Body).Decode(&agentResp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(agentResp.Artifacts) != 0 {
		t.Errorf("len(artifacts) = %d, want 0", len(agentResp.Artifacts))
	}
}

func TestPublishInvalidJSON(t *testing.T) {
	_, srv := newTestServer(t)

	resp, err := http.Post(srv.URL+"/v1/artifacts", "application/json", strings.NewReader("not json"))
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestPublishMissingArtifact(t *testing.T) {
	_, srv := newTestServer(t)

	body := mustMarshalJSON(t, PublishRequest{Tag: "latest"})
	resp, err := http.Post(srv.URL+"/v1/artifacts", "application/json", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}
}

func TestMethodNotAllowed(t *testing.T) {
	_, srv := newTestServer(t)

	cases := []struct {
		method string
		path   string
	}{
		{"DELETE", "/v1/artifacts"},
		{"PUT", "/v1/artifacts"},
		{"DELETE", "/v1/artifacts/sha256:abc"},
		{"POST", "/v1/agents/my-agent/artifacts"},
	}

	for _, c := range cases {
		req, err := http.NewRequest(c.method, srv.URL+c.path, nil)
		if err != nil {
			t.Fatalf("NewRequest: %v", err)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s %s: %v", c.method, c.path, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusMethodNotAllowed {
			t.Errorf("%s %s: status = %d, want 405", c.method, c.path, resp.StatusCode)
		}
	}
}

func TestComputeCasID(t *testing.T) {
	// Deterministic: same input → same output
	id1 := computeCasID([]byte(`{"a":1}`))
	id2 := computeCasID([]byte(`{"a":1}`))
	if id1 != id2 {
		t.Errorf("same input produced different CAS IDs: %q vs %q", id1, id2)
	}
	if !strings.HasPrefix(id1, "sha256:") {
		t.Errorf("cas_id = %q, want sha256: prefix", id1)
	}
	// Different input → different output
	id3 := computeCasID([]byte(`{"a":2}`))
	if id1 == id3 {
		t.Errorf("different input produced same CAS ID: %q", id1)
	}
}

func TestObjectPathForCasID(t *testing.T) {
	casID := "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
	p := objectPathForCasID("/reg", casID)
	want := "/reg/objects/ab/cd/abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789.json"
	if p != want {
		t.Errorf("path = %q, want %q", p, want)
	}
}

func TestDetectArtifactType(t *testing.T) {
	tests := []struct {
		data map[string]interface{}
		want string
	}{
		{map[string]interface{}{"agentbom_version": "0.1"}, "agentbom"},
		{map[string]interface{}{"posture_version": "1.0"}, "mcp-posture"},
		{map[string]interface{}{"passport_version": "0.2"}, "trust-passport"},
		{map[string]interface{}{"other_field": "val"}, "unknown"},
		{map[string]interface{}{}, "unknown"},
	}
	for _, tt := range tests {
		got := detectArtifactType(tt.data)
		if got != tt.want {
			t.Errorf("detectArtifactType(%v) = %q, want %q", tt.data, got, tt.want)
		}
	}
}
