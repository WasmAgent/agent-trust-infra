# Milestones

> Milestones 1–4 correspond to Weeks 0–12 deliverables — all shipped.
> See `docs/roadmap.md` for the authoritative status narrative.
> Active work starts at Milestone 5.
>
> **FROZEN PACKAGES — do not open issues, write tests, or make any changes:**
> `trust-passport-core` and `trust-runtime` are frozen. All Trust Passport
> feature work has moved to `WasmAgent/open-agent-audit`. Any bullet below that
> would require touching these packages must be implemented in that repo instead.

## Milestone 1 — Spec Skeletons & Repo Foundation (Shipped)

- [x] Public repo with vision, architecture, and boundaries docs
- [x] AgentBOM spec skeleton
- [x] MCP Posture spec skeleton
- [x] Trust Passport spec skeleton

## Milestone 2 — JSON Schemas & Validators (Shipped)

- [x] JSON schemas for AgentBOM, MCP Posture, and Trust Passport
- [x] Fixture-based validator tests for all three schemas
- [x] `trust-cli validate <artifact.json>` — validates artifact against published schemas with detailed error messages
- [x] `trust-cli generate bom --agent <path>` — produces valid AgentBOM JSON with tool inventory and permission mapping

## Milestone 3 — End-to-End Demo & Close-out (Shipped)

- [x] Full trust chain wired: `bscode → CapabilityManifest + AEP → AgentBOM → MCP Posture → audit report → Trust Passport`
- [x] `examples/bscode-agent/run-chain.sh` — single command runs the full offline demo
- [x] Architecture diagram and README stitching
- [x] `trust-cli sign <artifact.json> --key <key-path>` — signs Trust Passport with expiry, outputs signed JWT
- [x] `trust-cli verify <signed-passport.jwt>` — verifies signature, expiry, and chains trust evidence

## Milestone 4 — Research Preview Hardening (Shipped)

- [x] `AuditLog` schema extension to AgentBOM for structured audit trail entries
- [x] `trust-cli attest <action>` — generates signed attestation for audit log inclusion
- [x] `trust-cli audit-report <bom.json>` — generates human-readable audit summary with evidence citations
- [x] Compliance profile schema mapping trust artifacts to SOC2, ISO27001, eIDAS frameworks
- [x] Static papers site for `papers/` directory

## Milestone 5 — Regulatory Alignment (Phase 5, time-sensitive)

External deadlines drive this milestone. All items have corresponding GitHub issues.

- [ ] `specs/agentbom/ai-act-annex-iv-mapping.md` — AgentBOM field ↔ EU AI Act Annex IV technical documentation requirements table; citable by compliance teams before 2026-08-02 deadline (issue #171)
- [ ] AgentBOM schema: add "action pathway" fields (`tool_skills`, `prompt_version`, `policy_definitions`, `workflow_definitions`) per Oxford/Cisco arXiv 2026-03 proposal; positions AgentBOM ahead of CycloneDX ML-BOM standardization (issue #170, PR #179 open)
- [ ] MCP Posture schema: adapt for MCP 2026-07-28 stateless model — add audience-bound token field and MCP-Method/MCP-Name header risk entries (issue #173, PR #174 open)
- [ ] Replace doc-string coherence tests with CycloneDX/SPDX 3.0 schema conformance tests (issue #172, PRs #176 and #178 open)
- [ ] `specs/mcp-posture/owasp-alignment.md` — cross-reference MCP Posture risk taxonomy with OWASP Agentic Top 10 2026 (ASI01–ASI10)
- [ ] Compliance profile `eu-ai-act-annex-iv.json` — maps AgentBOM fields to Annex IV requirements for high-risk AI systems

## Milestone 6 — Production Hardening (Phase 6)

Begins when research preview graduates to production. **No Trust Passport work here** — `trust-passport-core` and `trust-runtime` are frozen; all Trust Passport work lives in `open-agent-audit`.

- [x] `@wasmagent/trust-cli` npm publish with binary builds for Linux, macOS, Windows — AgentBOM and MCP Posture CLI only (Trust Passport CLI lives in `open-agent-audit`) — publish workflow at `.github/workflows/publish.yml`, README at `cli/README.md` (issue #285)
- [ ] Compliance profile registry: `soc2-2024`, `iso27001-2022`, `eidas-controlled` with verified mapping to actual regulatory text
- [ ] `docs/cli.md` — complete command reference and examples for all shipped CLI commands
- [x] Static site for `papers/` directory so technical reports are browseable on the web

## Milestone 7 — Ecosystem & Standardization (Phase 7)

- [ ] AgentBOM as standalone specification repository if external adoption warrants
- [ ] MCP Posture as standalone MCP security product if demand appears
- [x] Propose AgentBOM to OpenSSF or equivalent standards body for cross-org adoption — proposal at `docs/openssf-proposal.md` (issue #200)

## Milestone 8 — Production Readiness & Enterprise Integration (Draft)

- [ ] Enterprise-grade BOM processing pipeline — streaming validation and incremental analysis for AgentBOM files >100MB, with backpressure-aware processing and bounded memory guarantees; horizontally scalable via partitioned artifact queues
- [ ] Trust Policy Engine SDK — declarative policy DSL for evaluating trust artifacts against organization governance rules (e.g., "reject agents with unapproved MCP servers", "require AEP for file-system tools"); Java/Python/Go libraries with policy composition and versioning
- [ ] Continuous Trust Monitoring service — daemon that watches agent runtime BOM drift, detects permission escalation attempts, and alerts on trust boundary violations; integrates with existing observability stacks (Prometheus, OpenTelemetry)
- [ ] Major agent framework integrations — official LangChain, LlamaIndex, and AutoGen plugins that auto-generate AgentBOM manifests from agent definitions; publish to respective package registries
- [x] Multi-party trust negotiation protocol — RFC for federated Trust Passport exchange between organizations, enabling cross-org agent deployment with mutual attestation and policy reconciliation — RFC at `specs/trust-passport/rfc-multi-party-negotiation.md` (issue #216)
- [ ] Production trust-cli hardening — SIGSTORE verification for signed artifacts, air-gapped installation mode, FIPS-compliant crypto backends, and enterprise SSO integration for attestation workflows
- [ ] Trust analytics dashboard — web UI for visualizing trust posture across agent fleets, BOM dependency graphs, compliance heatmaps, and audit log search with temporal filtering
- [x] BOM versioning and migration framework — semver-compatible schema evolution tooling with automated migration scripts, backward compatibility shims, and deprecation warnings for legacy AgentBOM/MCP Posture versions — framework at `agentbom-core`/`mcp-posture-core` index.ts, CLI `agentbom migrate`/`mcp-posture migrate` (issue #226)
- [ ] Performance benchmarks and SLIs — published throughput/latency benchmarks for validation operations, SLO guidance for production deployments (guidance at `docs/slo-guidance.md`, issue #233), and regression test suite for performance degradation (framework at `internal/performance/`, issue #234)
- [x] Enterprise onboarding and certification guide — runbooks for security teams adopting trust infra, attestation collection procedures, and trustworthiness review checklist before agent deployment to production — guide at `docs/enterprise-onboarding.md` (issue #223)

## Milestone 9 — Trust Chain Operations & Distribution (Proposed)

- [x] `trust-cli publish <artifact.json>` — publishes signed trust artifacts to a distribution registry with content-addressable storage (CAS) identifiers and immutable versioning — command at `cli/src/trust-publish.ts` (issue #239)
- [x] `trust-cli pull <artifact-id>` — retrieves trust artifacts from the registry by CAS identifier with integrity verification and dependency resolution — command at `cli/src/trust-pull.ts` (issue #240)
- [x] `trust-cli subscribe <agent-identity>` — sets up continuous monitoring for trust artifact updates from specific agent publishers with notification callbacks — command at `cli/src/trust-subscribe.ts` (issue #241)
- [ ] AgentBOM schema: add `distribution` object with `registry_uri`, `publication_timestamp`, `deprecation_status`, and `supersedes` fields for artifact lifecycle management
- [ ] MCP Posture schema: add `verification_endpoint` field specifying URL for real-time posture verification with token-based authentication
- [ ] Trust Passport schema: add `revocation` object with `revoked_at`, `revocation_reason`, and `revoking_authority` fields for trust chain invalidation
- [ ] `trust-cli verify-chain <passport.jwt> --depth N` — performs recursive trust chain verification with configurable depth and caching for multi-hop trust relationships
- [x] Registry service reference implementation with REST API for artifact publish/pull, query by agent identity, and GCAS-based deduplication — Go service at `cmd/registry-service/` with `net/http` stdlib (issue #247)
- [ ] `trust-cli diff <artifact-a.json> <artifact-b.json>` — generates structured diff report for trust artifacts highlighting permission changes, tool additions, and policy modifications
- [ ] Compliance framework integration: automated mapping updates when AgentBOM schema evolves, with backward compatibility checking for existing compliance profiles
- [ ] `trust-cli audit-stream <agent-identity>` — continuous audit log streaming with real-time compliance violation detection and alerting integration

This milestone transforms the trust infrastructure from a static artifact system into an operational distribution and verification platform, enabling multi-agent ecosystems to publish, discover, and verify trust artifacts at scale.
