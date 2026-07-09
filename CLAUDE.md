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
```
wasmagent-js (runtime protection / MCP firewall / AEP emitter)
    ↓ consumes specs defined here
Agent Trust Infrastructure (AgentBOM / MCP Posture / Trust Passport specs)
    ↓
open-agent-audit / Trustavo (evidence validation / audit reports)
    ↓
Trustavo Passport (signed / expiring / verifiable trust state)
```

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

## Current status

### Weeks 0–12: ALL COMPLETE ✅
- AgentBOM, MCP Posture, Trust Passport specs shipped
- JSON schemas, validators, fixture tests all passing
- End-to-end trust chain demo: `examples/bscode-agent/run-chain.sh`
- CLI: `trust-cli generate`, `validate`, `sign`, `verify`, `export-dashboard`
- Trust Dashboard (Milestone 4): mostly complete
  - ✅ Issues #103-106, #108-110, #127-132 closed
  - ✅ PR #122 merged (Fix #107 — export-dashboard command)
  - ✅ Issue #107 now fixed

### One remaining item
- ✅ Issue #107 (export-dashboard command) — PR #122 just merged

## Roadmap

Bot: implement issues in order. Check `docs/roadmap.md` for canonical tracking.
When items complete, update the checkboxes in `docs/roadmap.md`.

### In-flight (from docs/roadmap.md)
- [ ] Federation with `open-agent-audit` / `trace-pipeline` for shared evidence and audit-report plumbing
- [ ] Cryptographic Trust Passport signing (signed, revocable, expiring — beyond current reference validity model)
- [ ] Static site for `papers/` — make technical reports browseable on web
- [ ] Apply split criteria: evaluate whether AgentBOM/MCP Posture/Trust Passport should become standalone repos

### Phase 5 — Production hardening (when research preview graduates)
- [ ] `@wasmagent/trust-cli` npm publish with binary builds (Linux/macOS/Windows)
- [ ] `@wasmagent/trust-runtime` npm publish with TypeScript definitions
- [ ] Renewal and revocation model for Trust Passport (triggers, revocation list)
- [ ] Trust Passport integration with `open-agent-audit` audit report pipeline
- [ ] Compliance profile registry — `soc2-2024`, `iso27001-2022`, `eidas-controlled`

### Phase 6 — Ecosystem
- [ ] AgentBOM as standalone specification repo (if external adoption warrants)
- [ ] MCP Posture as standalone MCP security product (if demand appears)
- [ ] Trust Passport as product module under Trustavo (trustavo.com/passport)
- [ ] Cross-org standard: propose AgentBOM to OpenSSF or similar body

## How patrol sweep drives progress
Patrol reads this CLAUDE.md and `docs/roadmap.md`.
Unchecked items → patrol opens issues with `claude` label → workers implement.
When issues close, patrol updates roadmap checkboxes.
