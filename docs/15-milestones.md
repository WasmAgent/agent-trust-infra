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

- [ ] `@wasmagent/trust-cli` npm publish with binary builds for Linux, macOS, Windows — AgentBOM and MCP Posture CLI only (Trust Passport CLI lives in `open-agent-audit`)
- [ ] Compliance profile registry: `soc2-2024`, `iso27001-2022`, `eidas-controlled` with verified mapping to actual regulatory text
- [ ] `docs/cli.md` — complete command reference and examples for all shipped CLI commands
- [ ] Static site for `papers/` directory so technical reports are browseable on the web

## Milestone 7 — Ecosystem & Standardization (Phase 7)

- [ ] AgentBOM as standalone specification repository if external adoption warrants
- [ ] MCP Posture as standalone MCP security product if demand appears
- [x] Propose AgentBOM to OpenSSF or equivalent standards body for cross-org adoption — proposal at `docs/openssf-proposal.md` (issue #200)
