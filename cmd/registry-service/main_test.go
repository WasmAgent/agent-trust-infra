package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
	reg, err := NewRegistry(t.TempDir(), "", false)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	srv := httptest.NewServer(NewRouter(reg))
	t.Cleanup(srv.Close)
	return reg, srv
}

// newSchemaTestServer creates a Registry with schema distribution enabled,
// backed by t.TempDir() with schema files written into a specs/ layout.
func newSchemaTestServer(t *testing.T, offline bool) (*Registry, *httptest.Server) {
	t.Helper()
	regDir := t.TempDir()
	schemasDir := filepath.Join(regDir, "specs")

	// Create spec directories with schema.json files.
	for _, spec := range []struct {
		dir    string
		schema string
	}{
		{"agentbom", `{"$schema": "http://json-schema.org/draft-07/schema#", "$id": "https://github.com/WasmAgent/agent-trust-infra/specs/agentbom/schema.json", "title": "AgentBOM", "type": "object", "properties": {"agentbom_version": {"type": "string", "enum": ["0.1"]}, "identity": {"type": "object"}}}`},
		{"mcp-posture", `{"$schema": "http://json-schema.org/draft-07/schema#", "$id": "https://github.com/WasmAgent/agent-trust-infra/specs/mcp-posture/schema.json", "title": "MCPPosture", "type": "object", "properties": {"posture_version": {"type": "string", "enum": ["0.1"]}, "identity": {"type": "object"}}}`},
		{"trust-passport", `{"$schema": "http://json-schema.org/draft-07/schema#", "$id": "https://github.com/WasmAgent/agent-trust-infra/specs/trust-passport/schema.json", "title": "TrustPassport", "type": "object", "properties": {"passport_version": {"type": "string", "enum": ["0.1"]}, "identity": {"type": "object"}}}`},
		{"compliance-profile", `{"$schema": "http://json-schema.org/draft-07/schema#", "$id": "https://github.com/WasmAgent/agent-trust-infra/specs/compliance-profile/schema.json", "title": "ComplianceProfile", "type": "object", "properties": {"profile_version": {"type": "string", "enum": ["0.1"]}}}`},
	} {
		dir := filepath.Join(schemasDir, spec.dir)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
		if err := os.WriteFile(filepath.Join(dir, "schema.json"), []byte(spec.schema), 0o644); err != nil {
			t.Fatalf("write schema: %v", err)
		}
	}

	reg, err := NewRegistry(regDir, schemasDir, offline)
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

// ---- Schema distribution tests ----

func TestSchemaIndex(t *testing.T) {
	_, srv := newSchemaTestServer(t, false)

	resp, err := http.Get(srv.URL + "/v1/schemas")
	if err != nil {
		t.Fatalf("GET /v1/schemas: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var idx SchemaIndexResponse
	if err := json.NewDecoder(resp.Body).Decode(&idx); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if idx.Offline {
		t.Error("offline = true, want false")
	}
	if len(idx.Schemas) != 4 {
		t.Fatalf("len(schemas) = %d, want 4", len(idx.Schemas))
	}

	// Check that expected schemas are present.
	names := map[string]bool{}
	for _, s := range idx.Schemas {
		names[s.Name] = true
		if s.CasID == "" {
			t.Errorf("schema %q has empty cas_id", s.Name)
		}
		if s.Size == 0 {
			t.Errorf("schema %q has size 0", s.Name)
		}
		if s.URI == "" {
			t.Errorf("schema %q has empty uri", s.Name)
		}
	}
	for _, want := range []string{"agentbom", "mcp-posture", "trust-passport", "compliance-profile"} {
		if !names[want] {
			t.Errorf("missing schema %q in index", want)
		}
	}
}

func TestSchemaIndexOffline(t *testing.T) {
	_, srv := newSchemaTestServer(t, true)

	resp, err := http.Get(srv.URL + "/v1/schemas")
	if err != nil {
		t.Fatalf("GET /v1/schemas: %v", err)
	}
	defer resp.Body.Close()

	var idx SchemaIndexResponse
	if err := json.NewDecoder(resp.Body).Decode(&idx); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !idx.Offline {
		t.Error("offline = false, want true in offline mode")
	}
}

func TestSchemaGetByName(t *testing.T) {
	_, srv := newSchemaTestServer(t, false)

	resp, err := http.Get(srv.URL + "/v1/schemas/agentbom")
	if err != nil {
		t.Fatalf("GET /v1/schemas/agentbom: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	// Verify CDN headers.
	if got := resp.Header.Get("Cache-Control"); got != schemaCacheControl {
		t.Errorf("Cache-Control = %q, want %q", got, schemaCacheControl)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Access-Control-Allow-Origin = %q, want *", got)
	}
	if got := resp.Header.Get("Vary"); got != "Accept-Encoding" {
		t.Errorf("Vary = %q, want Accept-Encoding", got)
	}
	etag := resp.Header.Get("ETag")
	if etag == "" {
		t.Error("ETag header is empty, want non-empty")
	}
	if etag != "" && !strings.HasPrefix(etag, `"sha256:`) {
		t.Errorf("ETag = %q, want \"sha256:...\" quoted", etag)
	}
	contentLoc := resp.Header.Get("Content-Location")
	if !strings.HasPrefix(contentLoc, "/v1/schemas/cas/sha256:") {
		t.Errorf("Content-Location = %q, want /v1/schemas/cas/sha256:...", contentLoc)
	}
	digest := resp.Header.Get("X-Content-Digest")
	if !strings.HasPrefix(digest, "sha256:") {
		t.Errorf("X-Content-Digest = %q, want sha256:...", digest)
	}
	surrogate := resp.Header.Get("Surrogate-Key")
	if surrogate != "schema:agentbom" {
		t.Errorf("Surrogate-Key = %q, want schema:agentbom", surrogate)
	}

	// Verify body is valid JSON with the expected $id.
	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode schema body: %v", err)
	}
	if id, ok := body["$id"].(string); !ok || !strings.Contains(id, "agentbom") {
		t.Errorf("$id = %v, want URL containing 'agentbom'", body["$id"])
	}
}

func TestSchemaGetNotFound(t *testing.T) {
	_, srv := newSchemaTestServer(t, false)

	resp, err := http.Get(srv.URL + "/v1/schemas/nonexistent")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestSchemaCASLookup(t *testing.T) {
	reg, srv := newSchemaTestServer(t, false)

	// First, get the schema index to find the CAS ID for agentbom.
	idx := reg.SchemaIndex()
	var agentbomCAS string
	for _, s := range idx.Schemas {
		if s.Name == "agentbom" {
			agentbomCAS = s.CasID
			break
		}
	}
	if agentbomCAS == "" {
		t.Fatal("agentbom schema not found in index")
	}

	// Fetch by CAS ID.
	resp, err := http.Get(srv.URL + "/v1/schemas/cas/" + agentbomCAS)
	if err != nil {
		t.Fatalf("GET /v1/schemas/cas/%s: %v", agentbomCAS, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["title"] != "AgentBOM" {
		t.Errorf("title = %v, want AgentBOM", body["title"])
	}
}

func TestSchemaCASNotFound(t *testing.T) {
	_, srv := newSchemaTestServer(t, false)

	fakeCAS := "sha256:" + strings.Repeat("aa", 32)
	resp, err := http.Get(srv.URL + "/v1/schemas/cas/" + fakeCAS)
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestSchemaConditionalGET(t *testing.T) {
	_, srv := newSchemaTestServer(t, false)

	// First request — get the ETag.
	resp1, err := http.Get(srv.URL + "/v1/schemas/trust-passport")
	if err != nil {
		t.Fatalf("GET 1: %v", err)
	}
	defer resp1.Body.Close()
	etag := resp1.Header.Get("ETag")
	if etag == "" {
		t.Fatal("ETag is empty on first request")
	}

	// Second request — conditional with If-None-Match.
	req, err := http.NewRequest("GET", srv.URL+"/v1/schemas/trust-passport", nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("If-None-Match", etag)
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET 2: %v", err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusNotModified {
		t.Errorf("status = %d, want 304 Not Modified", resp2.StatusCode)
	}
}

func TestSchemaDisabledWithoutSchemasDir(t *testing.T) {
	// Default server without -schemas-dir — schema index should return empty list.
	_, srv := newTestServer(t)

	resp, err := http.Get(srv.URL + "/v1/schemas")
	if err != nil {
		t.Fatalf("GET /v1/schemas: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var idx SchemaIndexResponse
	if err := json.NewDecoder(resp.Body).Decode(&idx); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(idx.Schemas) != 0 {
		t.Errorf("len(schemas) = %d, want 0 (no schemas dir)", len(idx.Schemas))
	}
}

func TestSchemaNameFromPath(t *testing.T) {
	tests := []struct {
		rel  string
		want string
	}{
		{"agentbom/schema.json", "agentbom"},
		{"agentbom/agent-listing-schema.json", "agentbom-agent-listing-schema"},
		{"mcp-posture/schema.json", "mcp-posture"},
		{"trust-passport/schema.json", "trust-passport"},
		{"compliance-profile/schema.json", "compliance-profile"},
	}
	for _, tt := range tests {
		got := schemaNameFromPath(tt.rel)
		if got != tt.want {
			t.Errorf("schemaNameFromPath(%q) = %q, want %q", tt.rel, got, tt.want)
		}
	}
}

func TestDetectSchemaVersion(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{`{"agentbom_version": "0.1"}`, "0.1"},
		{`{"posture_version": "2.0"}`, "2.0"},
		{`{"passport_version": "1.3"}`, "1.3"},
		{`{"profile_version": "0.5"}`, "0.5"},
		{`{"other": "val"}`, "unknown"},
		{`not json`, "unknown"},
	}
	for _, tt := range tests {
		got := detectSchemaVersion([]byte(tt.raw))
		if got != tt.want {
			t.Errorf("detectSchemaVersion(%q) = %q, want %q", tt.raw, got, tt.want)
		}
	}
}

func TestSchemaMethodNotAllowed(t *testing.T) {
	_, srv := newSchemaTestServer(t, false)

	cases := []struct {
		method string
		path   string
	}{
		{"POST", "/v1/schemas"},
		{"DELETE", "/v1/schemas/agentbom"},
		{"PUT", "/v1/schemas/cas/sha256:abc"},
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

// ---- Multi-tenant isolation tests ----

// newMultiTenantTestServer creates a Registry with MultiTenant enabled
// backed by t.TempDir() and an httptest.Server.
func newMultiTenantTestServer(t *testing.T) (*Registry, *httptest.Server) {
	t.Helper()
	reg, err := NewRegistry(t.TempDir(), "", false)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	reg.MultiTenant = true
	srv := httptest.NewServer(NewRouter(reg))
	t.Cleanup(srv.Close)
	return reg, srv
}

func TestMultiTenantRejectMissingHeader(t *testing.T) {
	_, srv := newMultiTenantTestServer(t)

	cases := []struct {
		method string
		path   string
		body   string
	}{
		{"POST", "/v1/artifacts", `{"artifact": {"agentbom_version": "0.1"}}`},
		{"GET", "/v1/artifacts/sha256:abcd1234", ""},
		{"GET", "/v1/agents/my-agent/artifacts", ""},
	}

	for _, c := range cases {
		req, err := http.NewRequest(c.method, srv.URL+c.path, strings.NewReader(c.body))
		if err != nil {
			t.Fatalf("NewRequest: %v", err)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s %s: %v", c.method, c.path, err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s %s: status = %d, want 401 Unauthorized", c.method, c.path, resp.StatusCode)
		}
		var errResp ErrorResponse
		if err := json.NewDecoder(resp.Body).Decode(&errResp); err != nil {
			t.Fatalf("decode error: %v", err)
		}
		if !strings.Contains(errResp.Error, "X-Tenant-ID") {
			t.Errorf("%s %s: error = %q, want to mention X-Tenant-ID", c.method, c.path, errResp.Error)
		}
	}
}

func TestMultiTenantRejectInvalidTenantID(t *testing.T) {
	_, srv := newMultiTenantTestServer(t)

	cases := []string{
		"../etc/passwd",
		"foo/bar",
		"..",
		".",
	}

	for _, badID := range cases {
		body := mustMarshalJSON(t, PublishRequest{
			Artifact: mustMarshalJSON(t, map[string]string{"agentbom_version": "0.1"}),
		})
		req, err := http.NewRequest("POST", srv.URL+"/v1/artifacts", strings.NewReader(string(body)))
		if err != nil {
			t.Fatalf("NewRequest: %v", err)
		}
		req.Header.Set("X-Tenant-ID", badID)
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("POST with tenant %q: %v", badID, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("tenant %q: status = %d, want 401", badID, resp.StatusCode)
		}
	}
}

func TestMultiTenantPublishAndPull(t *testing.T) {
	_, srv := newMultiTenantTestServer(t)

	artifact := map[string]interface{}{
		"agentbom_version": "0.1",
		"agent":            map[string]interface{}{"name": "tenant-a-agent"},
	}

	body := mustMarshalJSON(t, PublishRequest{
		Artifact:      mustMarshalJSON(t, artifact),
		Tag:           "latest",
		AgentIdentity: "agent-a",
	})
	req, err := http.NewRequest("POST", srv.URL+"/v1/artifacts", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("X-Tenant-ID", "tenant-acme")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", resp.StatusCode)
	}

	var pubResp PublishResponse
	if err := json.NewDecoder(resp.Body).Decode(&pubResp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !strings.HasPrefix(pubResp.CasID, "sha256:") {
		t.Errorf("cas_id = %q, want sha256: prefix", pubResp.CasID)
	}
	if pubResp.ArtifactType != "agentbom" {
		t.Errorf("artifact_type = %q, want \"agentbom\"", pubResp.ArtifactType)
	}

	// Pull by CAS ID from the same tenant
	req2, err := http.NewRequest("GET", srv.URL+"/v1/artifacts/"+pubResp.CasID, nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req2.Header.Set("X-Tenant-ID", "tenant-acme")

	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatalf("GET artifact: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp2.StatusCode)
	}

	var artResp ArtifactResponse
	if err := json.NewDecoder(resp2.Body).Decode(&artResp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if artResp.CasID != pubResp.CasID {
		t.Errorf("cas_id = %q, want %q", artResp.CasID, pubResp.CasID)
	}
	if !artResp.IntegrityVerified {
		t.Error("integrity_verified = false, want true")
	}
}

func TestMultiTenantIsolation(t *testing.T) {
	_, srv := newMultiTenantTestServer(t)

	artifact := map[string]interface{}{"agentbom_version": "0.1", "name": "isolated-artifact"}

	// Publish to tenant-alpha
	body := mustMarshalJSON(t, PublishRequest{
		Artifact:      mustMarshalJSON(t, artifact),
		AgentIdentity: "shared-agent",
	})
	req, err := http.NewRequest("POST", srv.URL+"/v1/artifacts", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("X-Tenant-ID", "tenant-alpha")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST tenant-alpha: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", resp.StatusCode)
	}

	var pubResp PublishResponse
	if err := json.NewDecoder(resp.Body).Decode(&pubResp); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// tenant-beta should NOT be able to pull this artifact
	req2, err := http.NewRequest("GET", srv.URL+"/v1/artifacts/"+pubResp.CasID, nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req2.Header.Set("X-Tenant-ID", "tenant-beta")

	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatalf("GET tenant-beta: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusNotFound {
		t.Errorf("cross-tenant pull: status = %d, want 404 (isolated)", resp2.StatusCode)
	}

	// tenant-alpha SHOULD be able to pull this artifact
	req3, err := http.NewRequest("GET", srv.URL+"/v1/artifacts/"+pubResp.CasID, nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req3.Header.Set("X-Tenant-ID", "tenant-alpha")

	resp3, err := http.DefaultClient.Do(req3)
	if err != nil {
		t.Fatalf("GET tenant-alpha: %v", err)
	}
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusOK {
		t.Errorf("same-tenant pull: status = %d, want 200", resp3.StatusCode)
	}
}

func TestMultiTenantQueryAgentIsolation(t *testing.T) {
	_, srv := newMultiTenantTestServer(t)

	// Publish artifact for "shared-agent" in tenant-x
	body := mustMarshalJSON(t, PublishRequest{
		Artifact:      mustMarshalJSON(t, map[string]string{"agentbom_version": "0.1"}),
		AgentIdentity: "shared-agent",
	})
	req, err := http.NewRequest("POST", srv.URL+"/v1/artifacts", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("X-Tenant-ID", "tenant-x")
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", resp.StatusCode)
	}

	// Query shared-agent from tenant-x → should return 1 artifact
	req2, err := http.NewRequest("GET", srv.URL+"/v1/agents/shared-agent/artifacts", nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req2.Header.Set("X-Tenant-ID", "tenant-x")
	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatalf("GET tenant-x: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp2.StatusCode)
	}
	var agentRespX AgentArtifactsResponse
	if err := json.NewDecoder(resp2.Body).Decode(&agentRespX); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(agentRespX.Artifacts) != 1 {
		t.Fatalf("tenant-x: len(artifacts) = %d, want 1", len(agentRespX.Artifacts))
	}

	// Query shared-agent from tenant-y → should return 0 artifacts (isolated)
	req3, err := http.NewRequest("GET", srv.URL+"/v1/agents/shared-agent/artifacts", nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req3.Header.Set("X-Tenant-ID", "tenant-y")
	resp3, err := http.DefaultClient.Do(req3)
	if err != nil {
		t.Fatalf("GET tenant-y: %v", err)
	}
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp3.StatusCode)
	}
	var agentRespY AgentArtifactsResponse
	if err := json.NewDecoder(resp3.Body).Decode(&agentRespY); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(agentRespY.Artifacts) != 0 {
		t.Errorf("tenant-y: len(artifacts) = %d, want 0 (isolated from tenant-x)", len(agentRespY.Artifacts))
	}
}

func TestMultiTenantDeduplication(t *testing.T) {
	_, srv := newMultiTenantTestServer(t)

	artifact := map[string]interface{}{"agentbom_version": "0.1"}
	body := mustMarshalJSON(t, PublishRequest{Artifact: mustMarshalJSON(t, artifact)})

	// First publish to tenant-acme
	req1, err := http.NewRequest("POST", srv.URL+"/v1/artifacts", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req1.Header.Set("X-Tenant-ID", "tenant-acme")
	req1.Header.Set("Content-Type", "application/json")
	resp1, err := http.DefaultClient.Do(req1)
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

	// Same content to same tenant → deduplicated
	req2, err := http.NewRequest("POST", srv.URL+"/v1/artifacts", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req2.Header.Set("X-Tenant-ID", "tenant-acme")
	req2.Header.Set("Content-Type", "application/json")
	resp2, err := http.DefaultClient.Do(req2)
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
	if !pub2.Deduplicated {
		t.Error("same tenant dedup: deduplicated = false, want true")
	}

	// Same content to DIFFERENT tenant → NOT deduplicated (different tenant dir)
	req3, err := http.NewRequest("POST", srv.URL+"/v1/artifacts", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req3.Header.Set("X-Tenant-ID", "tenant-other")
	req3.Header.Set("Content-Type", "application/json")
	resp3, err := http.DefaultClient.Do(req3)
	if err != nil {
		t.Fatalf("POST 3: %v", err)
	}
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusCreated {
		t.Fatalf("status 3 = %d, want 201", resp3.StatusCode)
	}
	var pub3 PublishResponse
	if err := json.NewDecoder(resp3.Body).Decode(&pub3); err != nil {
		t.Fatalf("decode 3: %v", err)
	}
	if pub3.Deduplicated {
		t.Error("cross-tenant dedup: deduplicated = true, want false (isolated tenant storage)")
	}
	if pub3.CasID != pub1.CasID {
		t.Errorf("cross-tenant cas_id = %q, want %q (same content, same CAS ID)", pub3.CasID, pub1.CasID)
	}
}

func TestMultiTenantHealthUnaffected(t *testing.T) {
	_, srv := newMultiTenantTestServer(t)

	// Health endpoint should work without X-Tenant-ID even in multi-tenant mode
	resp, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}

func TestValidateTenantID(t *testing.T) {
	tests := []struct {
		id    string
		valid bool
	}{
		{"", false},
		{"acme-corp", true},
		{"tenant_123", true},
		{"org.example.com", true},
		{"abc/def", false},
		{"abc\\def", false},
		{".", false},
		{"..", false},
		{strings.Repeat("a", 128), true},
		{strings.Repeat("a", 129), false},
	}
	for _, tt := range tests {
		err := validateTenantID(tt.id)
		if tt.valid && err != nil {
			t.Errorf("validateTenantID(%q): unexpected error: %v", tt.id, err)
		}
		if !tt.valid && err == nil {
			t.Errorf("validateTenantID(%q): expected error, got nil", tt.id)
		}
	}
}

func TestTenantDir(t *testing.T) {
	got := tenantDir("/reg", "acme")
	want := "/reg/tenants/acme"
	if got != want {
		t.Errorf("tenantDir = %q, want %q", got, want)
	}
}
