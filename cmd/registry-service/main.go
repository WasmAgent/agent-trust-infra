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

// ---- Registry ----

// Registry manages the on-disk registry with thread-safe access.
type Registry struct {
	dir string
	mu  sync.Mutex
}

// NewRegistry creates or opens a registry at the given directory.
func NewRegistry(dir string) (*Registry, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create registry: %w", err)
	}
	return &Registry{dir: dir}, nil
}

// Publish stores an artifact in the registry with CAS-based deduplication.
// If the content already exists (same SHA-256 digest), the existing entry is
// returned with Deduplicated set to true and no storage is duplicated.
func (r *Registry) Publish(artifact json.RawMessage, tag, agentID string) (*PublishResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var data map[string]interface{}
	if err := json.Unmarshal(artifact, &data); err != nil {
		return nil, fmt.Errorf("invalid artifact JSON: %w", err)
	}

	casID := computeCasID(artifact)
	objPath := objectPathForCasID(r.dir, casID)

	manifest, err := readManifest(r.dir)
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
		if err := writeManifest(r.dir, manifest); err != nil {
			return nil, err
		}
	}

	if tag != "" {
		if err := writeTagPointer(r.dir, tag, casID); err != nil {
			return nil, err
		}
	}

	if agentID != "" {
		ids, err := readAgentIndex(r.dir, agentID)
		if err != nil {
			return nil, err
		}
		if !sliceContains(ids, casID) {
			ids = append(ids, casID)
			sort.Strings(ids)
			if err := writeAgentIndex(r.dir, agentID, ids); err != nil {
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
func (r *Registry) Pull(casID string) (*ArtifactResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	objPath := objectPathForCasID(r.dir, casID)
	raw, err := os.ReadFile(objPath)
	if err != nil {
		return nil, fmt.Errorf("artifact not found: %s", casID)
	}

	verified := computeCasID(raw) == casID
	var parsed map[string]interface{}
	json.Unmarshal(raw, &parsed)

	manifest, _ := readManifest(r.dir)

	return &ArtifactResponse{
		CasID:            casID,
		ArtifactType:     detectArtifactType(parsed),
		Version:          manifest[casID],
		IntegrityVerified: verified,
		Artifact:         raw,
	}, nil
}

// QueryByAgent returns artifacts associated with an agent identity.
func (r *Registry) QueryByAgent(agentID string) (*AgentArtifactsResponse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	ids, err := readAgentIndex(r.dir, agentID)
	if err != nil {
		return nil, err
	}

	manifest, _ := readManifest(r.dir)
	artifacts := make([]ArtifactSummary, 0, len(ids))

	for _, casID := range ids {
		s := ArtifactSummary{CasID: casID, Version: manifest[casID]}
		if raw, err := os.ReadFile(objectPathForCasID(r.dir, casID)); err == nil {
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

// ---- HTTP handlers ----

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, ErrorResponse{Error: msg})
}

func (r *Registry) handlePublish(w http.ResponseWriter, req *http.Request) {
	var pub PublishRequest
	if err := json.NewDecoder(req.Body).Decode(&pub); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if len(pub.Artifact) == 0 || string(pub.Artifact) == "null" {
		writeError(w, http.StatusBadRequest, "artifact field is required")
		return
	}
	resp, err := r.Publish(pub.Artifact, pub.Tag, pub.AgentIdentity)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (r *Registry) handleGetArtifact(w http.ResponseWriter, req *http.Request) {
	casID := strings.TrimPrefix(req.URL.Path, "/v1/artifacts/")
	if casID == "" || !strings.HasPrefix(casID, "sha256:") {
		writeError(w, http.StatusBadRequest, "invalid CAS identifier")
		return
	}
	resp, err := r.Pull(casID)
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
	resp, err := r.QueryByAgent(agentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, HealthResponse{Status: "ok", Version: "0.1.0"})
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

	if err := fs.Parse(args); err != nil {
		return 2, nil
	}

	reg, err := NewRegistry(*registryDir)
	if err != nil {
		return 1, fmt.Errorf("init registry: %w", err)
	}

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
