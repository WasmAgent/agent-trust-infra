# Roadmap

> **Status: public research preview — not production software.** All Weeks 0–12
> deliverables are **Shipped / Closed** — the public repo and the three
> specifications (AgentBOM, MCP Posture, Trust Passport), implemented in the
> codebase with JSON schemas and validators (Weeks 0–6), the working examples,
> and the Weeks 6–12 close-out (end-to-end chain visualization, runnable demo,
> and README stitching, PR #42). "Shipped / Closed" records these
> research-preview deliverables; it is not a production-readiness claim, and the
> repository's public production status remains an experimental research preview
> (see [`decision-log.md`](./decision-log.md)). The canonical,
> cross-organization record of that public production status — including the
> 'Published' spec status mirrored here — is the `wasmagent` **Release Ledger**;
> this roadmap defers to it so the two repos cannot diverge. Shipped features
> are recorded in the [Changelog](./CHANGELOG.md); this roadmap lists only
> future and in-flight work, tracked as follow-up issues.

## Shipped / Closed (Weeks 0–12)

These milestones are complete — they record what this repository already ships,
not outstanding work. See the [Changelog](./CHANGELOG.md) for the full per-item
checklist.

| Specification | Status |
|---|---|
| AgentBOM | Shipped |
| MCP Posture | Shipped |
| Trust Passport | Shipped |

- [x] **Weeks 0–2 — repo and spec skeletons:** public repo,
      vision/architecture/boundaries docs, and the AgentBOM, MCP Posture, and
      Trust Passport spec skeletons.
- [x] **Weeks 2–6 — working examples:** JSON schemas and validators for
      AgentBOM, MCP Posture, and Trust Passport, plus fixture-based tests.
- [x] **Weeks 6–12 — end-to-end demo (close-out):** the full trust chain is
      wired up — one command (`agent-trust chain` /
      `examples/bscode-agent/run-chain.sh`) walks
      `bscode → CapabilityManifest + AEP → AgentBOM → MCP Posture → audit
      report → Trust Passport` offline, with an architecture diagram and a
      runnable demo.

## In-flight / future work

The following items are **not yet shipped**. They are tracked as follow-up
issues and listed here as the active roadmap.

### Phase 5 — Regulatory alignment (time-sensitive)

External deadlines drive this phase. Items with issue numbers are already tracked.

- [ ] **#171** docs: `specs/agentbom/ai-act-annex-iv-mapping.md` — AgentBOM field ↔
      EU AI Act Annex IV technical documentation requirements table. Citable by
      compliance teams before 2026-08-02 deadline.
- [ ] **#170** feat: AgentBOM schema — add "action pathway" fields
      (`tool_skills`, `prompt_version`, `policy_definitions`, `workflow_definitions`)
      per Oxford/Cisco arXiv 2026-03 proposal. Positions AgentBOM ahead of
      CycloneDX ML-BOM standardization. (PR #179 open)
- [ ] **#173** feat: MCP Posture schema adaption for MCP 2026-07-28 stateless
      model, audience-bound token field, MCP-Method/MCP-Name header risk entries.
      (PR #174 open)
- [ ] **#172** test: replace doc-string coherence tests with CycloneDX/SPDX 3.0
      schema conformance tests. (PRs #176, #178 open)
- [ ] docs: `specs/mcp-posture/owasp-alignment.md` — cross-reference MCP Posture
      risk taxonomy with OWASP Agentic Top 10 2026 (ASI01–ASI10). Required for
      security teams to evaluate the posture model.
- [ ] feat: compliance profile — `eu-ai-act-annex-iv.json` for high-risk AI systems
      mapping AgentBOM fields to Annex IV requirements.

### Frozen — Trust Passport (moved to open-agent-audit)

`trust-passport-core` and `trust-runtime` are **frozen**. The product home for
Trust Passport is [`open-agent-audit`](https://github.com/WasmAgent/open-agent-audit).
Do not open new issues or PRs against these packages in this repo.

Migration issues filed in open-agent-audit:
- [#52](https://github.com/WasmAgent/open-agent-audit/issues/52) — validateTrustPassport() with prototype-pollution guard
- [#53](https://github.com/WasmAgent/open-agent-audit/issues/53) — content-addressable evidence storage (hashEvidence / addFact)
- [#54](https://github.com/WasmAgent/open-agent-audit/issues/54) — adopt Trust Passport v0.1 specification docs

The following items are **cancelled** for this repo (implement in open-agent-audit instead):
- ~~Federation with `open-agent-audit` / `trace-pipeline` for shared evidence and audit-report plumbing~~
- ~~Cryptographic Trust Passport signing (Sigstore/in-toto)~~

### In-flight (previously listed)

- [x] Static site for [`papers/`](../papers) so the technical reports are
      browseable on the web
- [ ] Apply split criteria (see below) once individual artifacts stabilize

### Phase 6 — Production hardening (when research preview graduates)

- [ ] `@wasmagent/trust-cli` npm publish with binary builds (Linux/macOS/Windows) — AgentBOM/MCP Posture CLI only; Trust Passport CLI moves to open-agent-audit
- ~~`@wasmagent/trust-runtime` npm publish~~ — frozen; implement in open-agent-audit
- ~~Renewal and revocation model for Trust Passport~~ — implement in open-agent-audit (see [#52](https://github.com/WasmAgent/open-agent-audit/issues/52)–[#54](https://github.com/WasmAgent/open-agent-audit/issues/54))
- ~~Trust Passport integration with `open-agent-audit` audit report pipeline~~ — Trust Passport product lives in open-agent-audit directly
- [ ] Compliance profile registry — `soc2-2024`, `iso27001-2022`, `eidas-controlled`
      with verified mapping to actual regulatory text (not just names)

### Phase 7 — Ecosystem

- [x] AgentBOM as standalone specification repo (if external adoption warrants) — extraction criteria added to spec (schema stability, external adoption/standardization pathway, regulatory coverage), mirrors MCP Posture pattern
- [x] MCP Posture as standalone MCP security product (if demand appears) — standalone product positioning documented in spec, package README added, validate + diff CLI commands implemented, risk taxonomy complete (8 categories)
- ~~Trust Passport as product module under Trustavo~~ — Trust Passport product development moves to open-agent-audit; schema incubation here is complete
- [x] Cross-org standard: propose AgentBOM to OpenSSF or similar body — proposal document at `docs/openssf-proposal.md` (issue #200)

## Future: split criteria

See [project-boundaries.md](./project-boundaries.md) for criteria governing when
AgentBOM, MCP Posture, or Trust Passport may be split into standalone
repositories. The intended future homes are:

- **AgentBOM** — may become a standalone specification repository if the schema
  stabilizes and external adoption or standardization needs emerge.
- **MCP Posture** — may become a standalone MCP security product if demand
  appears; runtime scanning primitives are owned by `wasmagent-js`.
- **Trust Passport** — expected to become a product module under
  `open-agent-audit` / Trustavo once its schema, validity model, renewal
  triggers, and revocation model are stable.
