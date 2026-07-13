# Agent Trust Infrastructure — CLAUDE.md

## Project overview
Public research preview for auditable AI agent trust. Ships three connected specifications
and reference implementations:

1. **AgentBOM** — bill of materials for AI agents (tool inventory, permissions, model deps)
2. **MCP Posture** — attack surface and permission posture for MCP-connected agents
3. **Trust Passport** — signed, expiring, verifiable trust-state artifact

**Status**: experimental research preview — not production software.
Weeks 0–12 deliverables are all shipped. The in-flight roadmap is in `docs/roadmap.md`.

## Relationship to WasmAgent ecosystem

**This repo is the specification layer. Runtime implementations live in `wasmagent-js`.**

```
wasmagent-js (runtime protection / MCP firewall / AEP emitter)
  @wasmagent/mcp-gateway     — identity propagation, policy enforcement, AEP evidence
  @wasmagent/mcp-attestation — capability attestation for MCP tools
  @wasmagent/aep             — AEP emitter, signing, evidence records
      ↓ consumes specs defined HERE
Agent Trust Infrastructure (AgentBOM / MCP Posture / Trust Passport specs + validators)
      ↓
open-agent-audit / Trustavo (evidence validation / audit reports)
      ↓
Trustavo Passport (signed / expiring / verifiable trust state)
```

**Do not duplicate logic already in `wasmagent-js`:**
- MCP traffic filtering / gating → `@wasmagent/mcp-gateway`
- Capability attestation → `@wasmagent/mcp-attestation`
- AEP evidence emission and signing → `@wasmagent/aep`
- This repo defines the schemas these packages implement, and ships CLI validators.

## Tech stack
- TypeScript + Bun monorepo (turbo)
- Packages: `agentbom-core`, `mcp-posture-core`, `trust-passport-core`, `trust-runtime`
- CLI: `cli/` directory
- Specs: `specs/agentbom/`, `specs/mcp-posture/`, `specs/trust-passport/`, `specs/compliance-profile/`
- Tests: `bun run test`
- Lint: `bun run lint` (biome)

## Build and verify
```bash
bun install
bun run lint        # must pass before commit
bun run typecheck
bun run test
```

## Bot instructions
- `bun run lint` must pass — CI fails on lint errors, use `bun run lint:fix` to auto-fix
- All new code must have tests
- Specs in `specs/` are the authoritative source — implementations must match them
- Do not break existing fixture-based tests (they validate spec conformance)
- `docs/roadmap.md` is the canonical roadmap — update it when items complete
- Do not re-implement runtime capabilities already in `wasmagent-js` packages

## Strategic positioning

**Read `docs/strategy.md` before opening new issues or designing new features.**

Key external drivers (2026):
- **EU AI Act Art. 11 + Annex IV** — technical documentation for high-risk AI systems
  effective 2026-08-02. Highest-value output: "AgentBOM field ↔ AI Act Annex IV"
  mapping table (issue #171).
- **MCP 2026-07-28** — stateless handle model. Schema adaptation shipped (commit bbfb7e8,
  PR #174 open). `MCP-Method`/`MCP-Name` header leakage risk belongs in MCP Posture
  risk taxonomy as a named risk pattern (do not duplicate in wasmagent-proxy).
- **CycloneDX ML-BOM / SPDX 3.0** — AI-BOM becoming mandatory in procurement.
  AgentBOM needs "action pathway" extension (tool skills, prompt versions, workflow
  definitions) — issue #170.
- **OWASP Agentic Top 10 2026** — align MCP Posture risk taxonomy with ASI01–ASI10.

## Current status

### Weeks 0–12: ALL COMPLETE ✅
- AgentBOM, MCP Posture, Trust Passport specs shipped
- JSON schemas, validators, fixture tests all passing
- End-to-end trust chain demo: `examples/bscode-agent/run-chain.sh`
- CLI: `trust-cli generate`, `validate`, `sign`, `verify`, `export-dashboard`
- Trust Dashboard (Milestone 4): complete
- MCP 2026-07-28 stateless model: schema adapted (commit bbfb7e8, PR #174 open)

### In-progress (open issues/PRs)
- Issue #170: AgentBOM action pathway schema extension (PR #179 open)
- Issue #171: AI Act Annex IV mapping table (open)
- Issue #172: Replace doc-string coherence tests with CycloneDX/SPDX conformance tests (PR #176, #178 open)
- Issue #173: MCP Posture schema for MCP 2026-07-28 (PR #174 open — already merged? check)
- Issue #162: trust-passport-core content-addressable evidence storage (PR #164 open)
- Issue #161: CLI adaptive compliance rule weighting (PR #163 open)

## Key references

| Reference | What it covers |
|---|---|
| `README.md` | Overview, quick start, trust chain diagram |
| `docs/strategy.md` | **Strategic positioning, competitive landscape, regulatory timeline** |
| `docs/roadmap.md` | Canonical roadmap — in-flight and future work |
| `docs/external-trends.md` | External drivers: OWASP, OTel GenAI, MCP, academic papers |
| `docs/vision.md` | Why trust artifacts matter; relationship to other WasmAgent projects |
| `docs/architecture.md` | Trust artifact chain, component responsibilities |
| `docs/compliance.md` | Compliance profile authoring guide |
| `specs/agentbom/` | AgentBOM spec + JSON schema |
| `specs/mcp-posture/` | MCP Posture spec + risk taxonomy |
| `specs/trust-passport/` | Trust Passport spec + schema |
| `profiles/` | Pre-built compliance profiles |
| `packages/agentbom-core/` | AgentBOM TypeScript reference implementation |
| `packages/mcp-posture-core/` | MCP Posture TypeScript reference implementation |
| `packages/trust-passport-core/` | Trust Passport TypeScript reference implementation |

## Roadmap

Bot: implement issues in order. Check `docs/roadmap.md` for canonical tracking.
When items complete, update the checkboxes in `docs/roadmap.md`.

### In-flight (from docs/roadmap.md)
- [ ] Federation with `open-agent-audit` / `trace-pipeline` for shared evidence and audit-report plumbing
- [ ] Cryptographic Trust Passport signing (signed, revocable, expiring — beyond current reference validity model)
- [ ] Static site for `papers/` — make technical reports browseable on web
- [ ] Apply split criteria: evaluate whether AgentBOM/MCP Posture/Trust Passport should become standalone repos

### Phase 5 — Regulatory alignment
- [ ] #171 docs: AgentBOM to EU AI Act Annex IV technical documentation mapping table
- [ ] #170 feat: AgentBOM schema — action pathway fields (tool_skills, prompt_version, policy_definitions, workflow_definitions) (PR #179)
- [ ] #173 feat: MCP Posture schema for MCP 2026-07-28 stateless model (PR #174)
- [ ] #172 test: replace doc-string coherence tests with CycloneDX/SPDX 3.0 schema conformance tests (PR #176, #178)
- [ ] docs: `specs/mcp-posture/owasp-alignment.md` — map risk taxonomy to OWASP Agentic Top 10 (ASI01–ASI10)
- [ ] feat: compliance profile — `eu-ai-act-annex-iv.json` for high-risk AI systems

### Phase 6 — Production hardening (when research preview graduates)
- [ ] `@wasmagent/trust-cli` npm publish with binary builds (Linux/macOS/Windows)
- [ ] `@wasmagent/trust-runtime` npm publish with TypeScript definitions
- [ ] Renewal and revocation model for Trust Passport (Sigstore/in-toto integration, not self-rolled)
- [ ] Trust Passport integration with `open-agent-audit` audit report pipeline
- [ ] Compliance profile registry — verified regulatory mapping for `soc2-2024`, `iso27001-2022`, `eidas-controlled`

### Phase 7 — Ecosystem
- [ ] AgentBOM as standalone specification repo (if external adoption warrants)
- [ ] MCP Posture as standalone MCP security product (if demand appears)
- [ ] Trust Passport as product module under Trustavo (trustavo.com/passport)
- [ ] Cross-org standard: propose AgentBOM to OpenSSF or similar body

## How patrol sweep drives progress
Patrol reads this CLAUDE.md and `docs/roadmap.md`.
Unchecked items → patrol opens issues with `claude` label → workers implement.
