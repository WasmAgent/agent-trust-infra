package main

// Registry service reference implementation — issue #247, Milestone 9.
//
// Provides a REST API over the local filesystem trust registry so that remote
// agents can publish and retrieve trust artifacts without direct filesystem
// access. Uses CAS-based (SHA-256) deduplication to avoid storing duplicate
// content.
//
// The on-disk layout is identical to cli/src/trust-publish.ts:
//
//	<registry>/objects/<hex[0:2]>/<hex[2:4]>/<full-hex>.json
//	<registry>/manifest.json       — {casId: version} ledger
//	<registry>/tags/<tag>.json     — tag → casId pointers
//	<registry>/agents/<id>.json    — agent identity → [casId] index
//
// Usage:
//
//	registry-serve                      # :3279 with ~/.trust-registry
//	registry-serve -addr :8080          # custom listen address
//	registry-serve -registry ./reg      # custom registry directory
//
// REST API:
//
//	POST /v1/artifacts                 Publish artifact
//	GET  /v1/artifacts/{casId}         Pull by CAS id
//	GET  /v1/agents/{identity}/artifacts  Query by agent identity
//	GET  /health                       Health check
//
// Schema distribution (when -schemas-dir is set):
//
//	GET  /v1/schemas                   List available schemas
//	GET  /v1/schemas/{name}            Serve schema by name (CDN-cached)
//	GET  /v1/schemas/cas/{casId}       Serve schema by content-addressable URI

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// ---- Request / Response types ----

// PublishRequest is the JSON body for POST /v1/artifacts.
type PublishRequest struct {
	// The trust artifact JSON object.
	Artifact json.RawMessage `json:"artifact"`
	// Optional tag to label this publication.
	Tag string `json:"tag,omitempty"`
	// Optional agent identity to associate with this artifact.
	AgentIdentity string `json:"agent_identity,omitempty"`
}

// PublishResponse is the JSON response for a successful publish.
type PublishResponse struct {
	CasID        string `json:"cas_id"`
	Version      int    `json:"version"`
	ArtifactType string `json:"artifact_type"`
	PublishedAt  string `json:"published_at"`
	SizeBytes    int64  `json:"size_bytes"`
	Deduplicated bool   `json:"deduplicated"`
	Tag          string `json:"tag,omitempty"`
}

// ArtifactResponse is the JSON response for GET /v1/artifacts/{casId}.
type ArtifactResponse struct {
	CasID            string          `json:"cas_id"`
	ArtifactType     string          `json:"artifact_type"`
	Version          int             `json:"version,omitempty"`
	IntegrityVerified bool           `json:"integrity_verified"`
	Artifact         json.RawMessage `json:"artifact"`
}

// AgentArtifactsResponse is the JSON response for GET /v1/agents/{id}/artifacts.
type AgentArtifactsResponse struct {
	AgentIdentity string            `json:"agent_identity"`
	Artifacts     []ArtifactSummary `json:"artifacts"`
}

// ArtifactSummary is a lightweight descriptor returned in list queries.
type ArtifactSummary struct {
	CasID        string `json:"cas_id"`
	ArtifactType string `json:"artifact_type,omitempty"`
	Version      int    `json:"version,omitempty"`
}

// HealthResponse is the JSON response for GET /health.
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

// ErrorResponse is a JSON error response.
type ErrorResponse struct {
	Error string `json:"error"`
}

// SchemaInfo describes a distributable schema available from the registry.
type SchemaInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	CasID   string `json:"cas_id"`
	Size    int64  `json:"size_bytes"`
	URI     string `json:"uri"`
}

// SchemaIndexResponse is the JSON response for GET /v1/schemas.
type SchemaIndexResponse struct {
	Schemas []SchemaInfo `json:"schemas"`
	Offline bool         `json:"offline"`
}

// schemaEntry holds a loaded schema's raw bytes and computed metadata.
type schemaEntry struct {
	data  []byte
	casID string
	info  SchemaInfo
}

// ---- Pure helpers ----

// computeCasID computes a SHA-256 content-addressable identifier from raw bytes.
// Returns "sha256:<hex-digest>".
func computeCasID(content []byte) string {
	h := sha256.Sum256(content)
	return "sha256:" + hex.EncodeToString(h[:])
}

// objectPathForCasID computes the sharded registry path for a CAS identifier.
// Mirrors the layout from cli/src/trust-publish.ts:
//
//	<registry>/objects/<hex[0:2]>/<hex[2:4]>/<full-hex>.json
func objectPathForCasID(registryDir, casID string) string {
	d := strings.TrimPrefix(casID, "sha256:")
	return filepath.Join(registryDir, "objects", d[:2], d[2:4], d+".json")
}

// detectArtifactType returns a type label for the artifact based on its fields.
// This is a simplified heuristic — full validators live in TypeScript packages.
func detectArtifactType(data map[string]interface{}) string {
	switch {
	case hasField(data, "agentbom_version"):
		return "agentbom"
	case hasField(data, "posture_version"):
		return "mcp-posture"
	case hasField(data, "passport_version"):
		return "trust-passport"
	default:
		return "unknown"
	}
}

func hasField(data map[string]interface{}, key string) bool {
	_, ok := data[key]
	return ok
}

// readManifest reads the registry manifest (CAS-id → version ledger).
func readManifest(registryDir string) (map[string]int, error) {
	manifest := make(map[string]int)
	p := filepath.Join(registryDir, "manifest.json")
	raw, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return manifest, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return nil, err
	}
	return manifest, nil
}

// writeManifest persists the registry manifest.
func writeManifest(registryDir string, manifest map[string]int) error {
	p := filepath.Join(registryDir, "manifest.json")
	if err := os.MkdirAll(registryDir, 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, append(raw, '\n'), 0o644)
}

// writeTagPointer writes a tag pointer file in the registry.
func writeTagPointer(registryDir, tag, casID string) error {
	dir := filepath.Join(registryDir, "tags")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	pointer := map[string]string{
		"cas_id":    casID,
		"tagged_at": time.Now().UTC().Format(time.RFC3339),
	}
	raw, _ := json.MarshalIndent(pointer, "", "  ")
	return os.WriteFile(filepath.Join(dir, tag+".json"), append(raw, '\n'), 0o644)
}

// readAgentIndex reads the agent-to-artifact index.
func readAgentIndex(registryDir, agentID string) ([]string, error) {
	p := filepath.Join(registryDir, "agents", agentID+".json")
	raw, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var ids []string
	if err := json.Unmarshal(raw, &ids); err != nil {
		return nil, err
	}
	return ids, nil
}

// writeAgentIndex writes the agent-to-artifact index.
func writeAgentIndex(registryDir, agentID string, casIDs []string) error {
	dir := filepath.Join(registryDir, "agents")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	raw, _ := json.MarshalIndent(casIDs, "", "  ")
	return os.WriteFile(filepath.Join(dir, agentID+".json"), append(raw, '\n'), 0o644)
}

func sliceContains(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}

// schemaCacheControl is the Cache-Control header value for schema responses.
// Long TTL with stale-while-revalidate enables CDN geo-replication while
// allowing clients to refresh in the background.
const schemaCacheControl = "public, max-age=86400, stale-while-revalidate=3600, immutable"

// schemaNameFromPath derives a URL-safe schema name from a file path
// relative to the schemas directory.
//
//	"agentbom/schema.json" → "agentbom"
//	"agentbom/agent-listing-schema.json" → "agentbom-agent-listing-schema"
//	"mcp-posture/schema.json" → "mcp-posture"
func schemaNameFromPath(relPath string) string {
	bare := strings.TrimSuffix(filepath.ToSlash(relPath), ".json")
	parts := strings.Split(bare, "/")
	// "agentbom/schema" → "agentbom" (the canonical schema.json in a spec dir)
	if len(parts) == 2 && parts[1] == "schema" {
		return parts[0]
	}
	// Flatten deeper paths: "agentbom/agent-listing-schema" → "agentbom-agent-listing-schema"
	return strings.Join(parts, "-")
}

// detectSchemaVersion extracts a version string from schema JSON content.
// Checks common version field names used across the trust infra specs.
func detectSchemaVersion(data []byte) string {
	var raw map[string]interface{}
	if json.Unmarshal(data, &raw) != nil {
		return "unknown"
	}
	for _, key := range []string{
		"agentbom_version", "posture_version", "passport_version",
		"profile_version", "listing_version",
	} {
		if v, ok := raw[key]; ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
	}
	return "unknown"
}

// ---- Multi-tenant helpers ----

// validateTenantID checks that a tenant ID is safe to use as a filesystem
// component (no path traversal, no dots-only, bounded length).
func validateTenantID(tenantID string) error {
	if tenantID == "" {
		return fmt.Errorf("X-Tenant-ID header is required for multi-tenant operations")
	}
	if strings.ContainsAny(tenantID, "/\\") || tenantID == "." || tenantID == ".." || len(tenantID) > 128 {
		return fmt.Errorf("invalid tenant ID: must be 1-128 characters without path separators")
	}
	return nil
}

// tenantDir returns the per-tenant subdirectory under the registry root.
//
//	<registry>/tenants/<tenantID>/
func tenantDir(registryDir, tenantID string) string {
	return filepath.Join(registryDir, "tenants", tenantID)
}

// ---- Registry ----

// Registry manages the on-disk registry with thread-safe access.
type Registry struct {
	dir         string
	schemasDir  string // local schema files directory for CDN-backed distribution (empty = disabled)
	offline     bool   // true = serve only local schemas, no external fetch
	mu          sync.Mutex
	schemas     map[string]schemaEntry // schema name → cached entry
	// MultiTenant enables per-tenant data isolation. When true, all artifact
	// operations require an X-Tenant-ID header and store data in per-tenant
	// subdirectories under <registry>/tenants/<id>/. When false (default),
	// the registry operates in single-tenant mode.
	MultiTenant bool
}

// NewRegistry creates or opens a registry at the given directory.
// schemasDir activates CDN-backed schema distribution when non-empty.
// offline enables air-gapped/fallback mode where only local schemas are served.
func NewRegistry(dir, schemasDir string, offline bool) (*Registry, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create registry: %w", err)
	}
	reg := &Registry{
		dir:        dir,
		schemasDir: schemasDir,
		offline:    offline,
	}
	if err := reg.loadSchemas(); err != nil {
		return nil, fmt.Errorf("load schemas: %w", err)
	}
	return reg, nil
}

// scopedDir returns the effective directory for the given tenant.
// In multi-tenant mode with a non-empty tenantID, returns the per-tenant
// subdirectory. Otherwise returns the base registry directory.
func (r *Registry) scopedDir(tenantID string) string {
	if r.MultiTenant && tenantID != "" {
		return tenantDir(r.dir, tenantID)
	}
	return r.dir
}

// tenantFromRequest extracts and validates the X-Tenant-ID header.
// Returns empty string (no tenant scoping) in single-tenant mode.
func (r *Registry) tenantFromRequest(req *http.Request) (string, error) {
	if !r.MultiTenant {
		return "", nil
	}
	tid := strings.TrimSpace(req.Header.Get("X-Tenant-ID"))
	if err := validateTenantID(tid); err != nil {
		return "", err
	}
	return tid, nil
}

// loadSchemas walks the schemas directory and caches all schema files.
// Each schema.json in a subdirectory is named after that directory.
// Other *-schema.json files use their full relative path (flattened).
func (r *Registry) loadSchemas() error {
	if r.schemasDir == "" {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	r.schemas = make(map[string]schemaEntry)

	err := filepath.Walk(r.schemasDir, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		if !strings.HasSuffix(info.Name(), ".json") {
			return nil
		}

		raw, err := os.ReadFile(p)
		if err != nil {
			return nil // skip unreadable files
		}

		rel, _ := filepath.Rel(r.schemasDir, p)
		name := schemaNameFromPath(rel)
		casID := computeCasID(raw)
		version := detectSchemaVersion(raw)

		r.schemas[name] = schemaEntry{
			data:  raw,
			casID: casID,
			info: SchemaInfo{
				Name:    name,
				Version: version,
				CasID:   casID,
				Size:    int64(len(raw)),
				URI:     "/v1/schemas/cas/" + casID,
			},
		}
		return nil
	})

	return err
}

// Publish stores an artifact in the registry with CAS-based deduplication.
// If the content already exists (same SHA-256 digest), the existing entry is
// returned with Deduplicated set to true and no storage is duplicated.
// In multi-tenant mode, tenantID scopes all storage to a per-tenant directory.
func (r *Registry) Publish(artifact json.RawMessage, tag, agentID, tenantID string) (*PublishResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var data map[string]interface{}
	if err := json.Unmarshal(artifact, &data); err != nil {
		return nil, fmt.Errorf("invalid artifact JSON: %w", err)
	}

	dir := r.scopedDir(tenantID)
	casID := computeCasID(artifact)
	objPath := objectPathForCasID(dir, casID)

	manifest, err := readManifest(dir)
	if err != nil {
		return nil, err
	}

	existingVer, exists := manifest[casID]
	dedup := exists
	version := existingVer

	if !exists {
		version = len(manifest) + 1
		manifest[casID] = version
		if err := os.MkdirAll(filepath.Dir(objPath), 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(objPath, artifact, 0o644); err != nil {
			return nil, err
		}
		if err := writeManifest(dir, manifest); err != nil {
			return nil, err
		}
	}

	if tag != "" {
		if err := writeTagPointer(dir, tag, casID); err != nil {
			return nil, err
		}
	}

	if agentID != "" {
		ids, err := readAgentIndex(dir, agentID)
		if err != nil {
			return nil, err
		}
		if !sliceContains(ids, casID) {
			ids = append(ids, casID)
			sort.Strings(ids)
			if err := writeAgentIndex(dir, agentID, ids); err != nil {
				return nil, err
			}
		}
	}

	var size int64
	if fi, err := os.Stat(objPath); err == nil {
		size = fi.Size()
	}

	return &PublishResponse{
		CasID:        casID,
		Version:      version,
		ArtifactType: detectArtifactType(data),
		PublishedAt:  time.Now().UTC().Format(time.RFC3339),
		SizeBytes:    size,
		Deduplicated: dedup,
		Tag:          tag,
	}, nil
}

// Pull retrieves an artifact by CAS ID with integrity verification.
// In multi-tenant mode, tenantID scopes retrieval to the per-tenant directory.
func (r *Registry) Pull(casID, tenantID string) (*ArtifactResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	dir := r.scopedDir(tenantID)
	objPath := objectPathForCasID(dir, casID)
	raw, err := os.ReadFile(objPath)
	if err != nil {
		return nil, fmt.Errorf("artifact not found: %s", casID)
	}

	verified := computeCasID(raw) == casID
	var parsed map[string]interface{}
	json.Unmarshal(raw, &parsed)

	manifest, _ := readManifest(dir)

	return &ArtifactResponse{
		CasID:            casID,
		ArtifactType:     detectArtifactType(parsed),
		Version:          manifest[casID],
		IntegrityVerified: verified,
		Artifact:         raw,
	}, nil
}

// QueryByAgent returns artifacts associated with an agent identity.
// In multi-tenant mode, tenantID scopes the query to the per-tenant directory.
func (r *Registry) QueryByAgent(agentID, tenantID string) (*AgentArtifactsResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	dir := r.scopedDir(tenantID)
	ids, err := readAgentIndex(dir, agentID)
	if err != nil {
		return nil, err
	}

	manifest, _ := readManifest(dir)
	artifacts := make([]ArtifactSummary, 0, len(ids))

	for _, casID := range ids {
		s := ArtifactSummary{CasID: casID, Version: manifest[casID]}
		if raw, err := os.ReadFile(objectPathForCasID(dir, casID)); err == nil {
			var parsed map[string]interface{}
			if json.Unmarshal(raw, &parsed) == nil {
				s.ArtifactType = detectArtifactType(parsed)
			}
		}
		artifacts = append(artifacts, s)
	}

	return &AgentArtifactsResponse{
		AgentIdentity: agentID,
		Artifacts:     artifacts,
	}, nil
}

// SchemaIndex returns metadata for all loaded schemas.
func (r *Registry) SchemaIndex() *SchemaIndexResponse {
	r.mu.Lock()
	defer r.mu.Unlock()

	infos := make([]SchemaInfo, 0, len(r.schemas))
	for _, entry := range r.schemas {
		infos = append(infos, entry.info)
	}
	sort.Slice(infos, func(i, j int) bool {
		return infos[i].Name < infos[j].Name
	})

	return &SchemaIndexResponse{
		Schemas: infos,
		Offline: r.offline,
	}
}

// copySchemaEntry returns a deep copy of a schema entry so callers can safely
// use the data after the mutex is released, even if loadSchemas() replaces the
// underlying map concurrently.
func copySchemaEntry(e schemaEntry) schemaEntry {
	cp := e
	if len(e.data) > 0 {
		cp.data = make([]byte, len(e.data))
		copy(cp.data, e.data)
	}
	return cp
}

// ServeSchema returns a deep copy of a schema entry by name, or nil if not found.
// The returned entry is safe to use after the mutex is released.
func (r *Registry) ServeSchema(name string) *schemaEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	if e, ok := r.schemas[name]; ok {
		cp := copySchemaEntry(e)
		return &cp
	}
	return nil
}

// ServeSchemaByCAS returns a deep copy of a schema entry by its
// content-addressable ID, or nil. The returned entry is safe to use after the
// mutex is released.
func (r *Registry) ServeSchemaByCAS(casID string) *schemaEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, e := range r.schemas {
		if e.casID == casID {
			cp := copySchemaEntry(e)
			return &cp
		}
	}
	return nil
}

// writeSchemaHeaders sets CDN-friendly HTTP headers for schema responses.
// These headers enable geo-replication via CDN caches, content-addressable
// version pinning, and efficient cache invalidation.
func writeSchemaHeaders(w http.ResponseWriter, entry schemaEntry) {
	w.Header().Set("Cache-Control", schemaCacheControl)
	w.Header().Set("ETag", `"`+entry.casID+`"`)
	w.Header().Set("Content-Location", "/v1/schemas/cas/"+entry.casID)
	w.Header().Set("X-Content-Digest", entry.casID)
	w.Header().Set("Surrogate-Key", "schema:"+entry.info.Name)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Vary", "Accept-Encoding")
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, ErrorResponse{Error: msg})
}

func (r *Registry) handlePublish(w http.ResponseWriter, req *http.Request) {
	tenantID, err := r.tenantFromRequest(req)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	var pub PublishRequest
	if err := json.NewDecoder(req.Body).Decode(&pub); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if len(pub.Artifact) == 0 || string(pub.Artifact) == "null" {
		writeError(w, http.StatusBadRequest, "artifact field is required")
		return
	}
	resp, err := r.Publish(pub.Artifact, pub.Tag, pub.AgentIdentity, tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (r *Registry) handleGetArtifact(w http.ResponseWriter, req *http.Request) {
	tenantID, err := r.tenantFromRequest(req)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	casID := strings.TrimPrefix(req.URL.Path, "/v1/artifacts/")
	if casID == "" || !strings.HasPrefix(casID, "sha256:") {
		writeError(w, http.StatusBadRequest, "invalid CAS identifier")
		return
	}
	resp, err := r.Pull(casID, tenantID)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (r *Registry) handleQueryAgent(w http.ResponseWriter, req *http.Request) {
	const prefix = "/v1/agents/"
	const suffix = "/artifacts"
	if !strings.HasPrefix(req.URL.Path, prefix) || !strings.HasSuffix(req.URL.Path, suffix) {
		writeError(w, http.StatusBadRequest, "invalid path; expected /v1/agents/{identity}/artifacts")
		return
	}
	agentID := strings.TrimPrefix(req.URL.Path, prefix)
	agentID = strings.TrimSuffix(agentID, suffix)
	if agentID == "" {
		writeError(w, http.StatusBadRequest, "agent identity is required")
		return
	}
	tenantID, err := r.tenantFromRequest(req)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	resp, err := r.QueryByAgent(agentID, tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, HealthResponse{Status: "ok", Version: "0.1.0"})
}

// ---- Schema distribution handlers ----

func (r *Registry) handleSchemaIndex(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, r.SchemaIndex())
}

func (r *Registry) handleSchemaGet(w http.ResponseWriter, req *http.Request) {
	name := strings.TrimPrefix(req.URL.Path, "/v1/schemas/")
	// Reject CAS-style paths — those have their own handler.
	if strings.HasPrefix(name, "cas/") {
		writeError(w, http.StatusNotFound, "use /v1/schemas/cas/{casId} for content-addressed lookup")
		return
	}
	if name == "" {
		writeError(w, http.StatusBadRequest, "schema name is required")
		return
	}

	// Support If-None-Match for conditional GET (CDN revalidation).
	entry := r.ServeSchema(name)
	if entry == nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("schema %q not found", name))
		return
	}

	if match := req.Header.Get("If-None-Match"); match != "" {
		if match == `"`+entry.casID+`"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}

	writeSchemaHeaders(w, *entry)
	w.Header().Set("Content-Type", "application/schema+json")
	w.WriteHeader(http.StatusOK)
	w.Write(entry.data)
}

func (r *Registry) handleSchemaCAS(w http.ResponseWriter, req *http.Request) {
	casID := strings.TrimPrefix(req.URL.Path, "/v1/schemas/cas/")
	if casID == "" || !strings.HasPrefix(casID, "sha256:") {
		writeError(w, http.StatusBadRequest, "invalid CAS identifier; expected sha256:<digest>")
		return
	}

	entry := r.ServeSchemaByCAS(casID)
	if entry == nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("no schema with CAS ID %s", casID))
		return
	}

	if match := req.Header.Get("If-None-Match"); match != "" {
		if match == `"`+entry.casID+`"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}

	writeSchemaHeaders(w, *entry)
	w.Header().Set("Content-Type", "application/schema+json")
	w.WriteHeader(http.StatusOK)
	w.Write(entry.data)
}

// ---- Router ----

// NewRouter creates an HTTP handler with all registry routes.
func NewRouter(reg *Registry) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)

	// POST /v1/artifacts — publish
	mux.HandleFunc("/v1/artifacts", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			reg.handlePublish(w, r)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed; use POST")
		}
	})

	// GET /v1/artifacts/{casId} — pull
	mux.HandleFunc("/v1/artifacts/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			reg.handleGetArtifact(w, r)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed; use GET")
		}
	})

	// GET /v1/agents/{identity}/artifacts — query by agent
	mux.HandleFunc("/v1/agents/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			reg.handleQueryAgent(w, r)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed; use GET")
		}
	})

	// Schema distribution — CDN-backed with content-addressable URIs
	// GET /v1/schemas — list available schemas
	mux.HandleFunc("/v1/schemas", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			reg.handleSchemaIndex(w, r)
		} else {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed; use GET")
		}
	})

	// GET /v1/schemas/{name} — serve schema by name
	mux.HandleFunc("/v1/schemas/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed; use GET")
			return
		}
		// Route CAS-style paths to the CAS handler.
		if strings.TrimPrefix(r.URL.Path, "/v1/schemas/") == "cas/" ||
			strings.HasPrefix(strings.TrimPrefix(r.URL.Path, "/v1/schemas/"), "cas/") {
			reg.handleSchemaCAS(w, r)
			return
		}
		reg.handleSchemaGet(w, r)
	})

	return mux
}

// ---- Entry point ----

func defaultRegistryDir() string {
	if d := os.Getenv("TRUST_REGISTRY_DIR"); d != "" {
		return d
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".trust-registry")
}

// Run starts the registry service. Returns exit code and optional error.
func Run(args []string, stdout, stderr io.Writer) (int, error) {
	fs := flag.NewFlagSet("registry-serve", flag.ContinueOnError)
	fs.SetOutput(stderr)

	addr := fs.String("addr", ":3279", "listen address (host:port)")
	registryDir := fs.String("registry", defaultRegistryDir(), "registry directory")
	schemasDir := fs.String("schemas-dir", "", "local schemas directory for CDN-backed distribution (empty = disabled)")
	offline := fs.Bool("offline", false, "enable offline/fallback mode (serve only local schemas)")
	multiTenant := fs.Bool("multi-tenant", false, "enable multi-tenant isolation (requires X-Tenant-ID header for artifact operations)")

	if err := fs.Parse(args); err != nil {
		return 2, nil
	}

	reg, err := NewRegistry(*registryDir, *schemasDir, *offline)
	if err != nil {
		return 1, fmt.Errorf("init registry: %w", err)
	}
	reg.MultiTenant = *multiTenant

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		return 1, fmt.Errorf("listen %s: %w", *addr, err)
	}

	fmt.Fprintf(stdout, "Registry service listening on %s\n", *addr)
	fmt.Fprintf(stdout, "Registry directory: %s\n", *registryDir)
	fmt.Fprintf(stdout, "Endpoints:\n")
	fmt.Fprintf(stdout, "  POST /v1/artifacts              Publish artifact\n")
	fmt.Fprintf(stdout, "  GET  /v1/artifacts/{casId}     Retrieve artifact\n")
	fmt.Fprintf(stdout, "  GET  /v1/agents/{id}/artifacts  Query by agent identity\n")
	fmt.Fprintf(stdout, "  GET  /health                   Health check\n")
	if *schemasDir != "" {
		fmt.Fprintf(stdout, "Schema distribution:\n")
		fmt.Fprintf(stdout, "  GET  /v1/schemas                  List available schemas\n")
		fmt.Fprintf(stdout, "  GET  /v1/schemas/{name}           Serve schema by name\n")
		fmt.Fprintf(stdout, "  GET  /v1/schemas/cas/{casId}     Serve schema by content-addressable URI\n")
		fmt.Fprintf(stdout, "  Schemas directory: %s\n", *schemasDir)
		if *offline {
			fmt.Fprintf(stdout, "  Mode: offline (air-gapped, local schemas only)\n")
		}
	}

	srv := &http.Server{Handler: NewRouter(reg)}
	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		return 1, fmt.Errorf("server: %w", err)
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
