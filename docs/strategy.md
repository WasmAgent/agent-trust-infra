# Strategy

## Role in the WasmAgent ecosystem

This repository is the **specification and schema layer**. Runtime enforcement
lives in `wasmagent-js`:

| Capability | Live in | NOT here |
|---|---|---|
| MCP traffic filtering, gating | `@wasmagent/mcp-gateway` | ✗ |
| Capability attestation registry | `@wasmagent/mcp-attestation` | ✗ |
| AEP evidence emission + signing | `@wasmagent/aep` | ✗ |
| AgentBOM / MCP Posture / Trust Passport schemas + validators | **this repo** | — |
| Compliance profile definitions | **this repo** | — |
| `agent-trust` CLI (validate, sign, audit-report) | **this repo** | — |

If a feature can be expressed as a schema, validator, CLI command, or
specification document, it belongs here. If it requires runtime hooks into
MCP traffic or AEP evidence streams, it belongs in `wasmagent-js`.

## Why this project exists (external drivers)

### EU AI Act — the 2026-08-02 cliff

Article 11 + Annex IV require technical documentation for high-risk AI
systems, effective 2026-08-02 (possible Digital Omnibus delay to 2027-12,
but that is not confirmed). Procurement teams are already asking for
something they can point to.

The highest-value near-term output is a direct mapping table:

> "AgentBOM field X satisfies Annex IV requirement Y"

This turns a research prototype into something a compliance team can cite
in an RFP response today — without waiting for formal standardization.

### CycloneDX ML-BOM / SPDX 3.0 — AIBOM going mandatory

CycloneDX ML-BOM is already being cited in procurement RFPs.
SPDX 3.0 has added AI/dataset BOM extensions.

Oxford/Cisco (arXiv 2026-03) argue traditional AIBOM covers model + data
but misses **"action pathway" artifacts**: tool skills, prompt versions,
policy definitions, workflow definitions. AgentBOM is positioned to be
the first schema that includes these as first-class fields.

**Action**: add action pathway fields to `specs/agentbom/schema.json`
before CycloneDX formalizes their own extension — arriving first is the
only way to influence the standard.

### OWASP Agentic Top 10 2026

OWASP's ASI01–ASI10 list is becoming the vocabulary security teams use
to describe agent risks. MCP Posture's risk taxonomy must speak this
language, or it will be dismissed by any security team that has read
the OWASP doc.

Current risk taxonomy in `specs/mcp-posture/risk-taxonomy.md` uses
internal categorization. It needs a cross-reference column to ASI IDs.

### MCP 2026-07-28 — stateless handle model

The schema adaptation is already shipped (commit bbfb7e8). Two ongoing
concerns:

1. **MCP-Method/MCP-Name header leakage**: new headers that developers
   may accidentally populate with secrets. This is a detection concern
   for `wasmagent-proxy` (network layer) and a documentation concern
   here — the MCP Posture risk taxonomy should name this specific risk
   pattern so audit teams know to check for it.
2. **Handle expiry semantics**: "portable handle" replaces session; Trust
   Passport validity periods may need a new field to express
   handle-scoped trust vs. session-scoped trust.

## What to avoid

- **Re-implementing runtime capabilities**: MCP filtering, AEP signing,
  attestation registry — these are done in `wasmagent-js`. Do not
  duplicate them here.
- **"Shipped" theater**: marking things shipped in test strings or docs
  without real external verifiability. The value of this project comes
  from artifacts that a third-party can independently verify.
  Use schema conformance tests (CycloneDX/SPDX validators) rather than
  string-match tests on documentation.
- **Competing with MS Agent Governance Toolkit on control-plane features**:
  they decide "should"; we document "what the agent is made of." The
  complementary framing is more credible.

## Priority order
1. AI Act Annex IV mapping table — citable today, before the deadline
2. Action pathway fields in AgentBOM schema — establish first-mover position
3. MCP Posture risk taxonomy aligned to OWASP ASI01–ASI10
4. Trust Passport cryptographic signing (Sigstore/in-toto, not self-rolled)
5. Conformance tests replacing string-match "Shipped" checks
