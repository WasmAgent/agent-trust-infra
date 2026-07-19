# AgentBOM — OpenSSF Sandbox Project Proposal

> **Status:** draft proposal — ready for community review and sponsor recruitment.
> **Last updated:** 2026-07-19.
> **Tracking:** WasmAgent/agent-trust-infra#200.

## 1. Executive summary

AgentBOM is an open specification for an **AI Agent Bill of Materials** — a
structured, machine-readable artifact that captures the full deployed composition
of an AI agent: model dependencies, tool inventory, permission boundaries,
prompt provenance, workflow definitions, risk signals, and runtime evidence.

Existing SBOM standards (CycloneDX, SPDX) catalog software components and, more
recently, ML model metadata. They do not capture the *agentic operational
surface* — the tools an agent can invoke, the permissions it holds, the prompts
that govern its behavior, or the workflows it can execute. AgentBOM fills this
gap as a **complementary layer** to existing SBOM and AIBOM formats.

This document proposes submitting AgentBOM to the **OpenSSF AI/ML Security
Working Group** as a sandbox project, with secondary alignment to the **SBOM
Everywhere SIG** for schema interoperability with CycloneDX ML-BOM and SPDX 3.0.

## 2. Problem statement

AI agents are being deployed at scale across enterprises — coding assistants,
customer support bots, data analysis pipelines, security operations, and more.
Unlike traditional software, an AI agent's behavior is determined not only by
its code but by:

- **Model dependencies** — which LLM or models power the agent and with what
  capabilities.
- **Tool surfaces** — which tools (MCP servers, plugins, built-in functions) the
  agent can invoke and what permissions each requires.
- **Prompt governance** — which system prompts, templates, and versioned prompt
  configurations govern the agent's behavior.
- **Permission boundaries** — what data the agent can access, what scopes it
  holds, and what credentials it references.
- **Workflow definitions** — the ordered sequences of tool calls, decisions,
  and actions the agent can execute.
- **Risk signals** — known vulnerabilities, open findings, and mitigations
  associated with the deployment.

**No existing standard captures all of these dimensions in a single,
machine-readable artifact.** SBOM formats list static components; AIBOM
initiatives track model lineage; OWASP catalogs risks. None provide a unified,
diffable bill of materials for the *agent itself*.

This creates concrete problems:

1. **Procurement cannot assess agent risk.** Procurement teams reviewing AI
   agent deployments lack a standard artifact to evaluate tool permissions,
   data access scope, and model dependencies. They are reduced to ad-hoc
   questionnaires.
2. **Compliance teams cannot automate checks.** EU AI Act Annex IV (effective
   2026-08-02) requires technical documentation for high-risk AI systems.
   Without a structured format, compliance mapping is manual and unrepeatable.
3. **Security teams lack tooling hooks.** Vulnerability scanners operate on
   SBOMs, but agent-specific attack surfaces (tool permissions, prompt
   injection vectors, excessive agency) are invisible to existing tooling.
4. **Auditors cannot verify change.** Between two agent deployments, there is
   no standard diffable format to answer "what changed in the agent's composition?"

AgentBOM solves these problems by providing a single, versioned, JSON-schema-
validated artifact that describes the full deployed composition of an AI agent.

## 3. What AgentBOM covers

AgentBOM v0.1 defines the following layers:

| Layer | Purpose | Existing standard coverage |
|---|---|---|
| `identity` | Agent ID, name, version, deployment context | Partial (package metadata in SBOM) |
| `model_layer` | Model provider, model ID, version, capabilities | Partial (CycloneDX ML-BOM) |
| `tool_layer` | Registered tools, MCP servers, skills, permissions, risk signals | **None** |
| `prompt_layer` | System prompt hashes, prompt versions, template references | **None** |
| `permission_layer` | Granted scopes, data access, credential references | **None** |
| `policy_definitions` | Governance policies, constraints, compliance rules | **None** |
| `evidence_layer` | AEP references, runtime evidence hashes | **None** |
| `audit_log` | Structured audit trail entries | **None** |
| `risk_layer` | Known risks, severity, category, status | Partial (vulnerability entries in SBOM) |
| `workflow_layer` | Action pathway definitions (steps, dependencies, allowed tools) | **None** |
| `attestation` | Generator, timestamp, hash, signature | Partial (SLSA provenance) |

**Six of eleven layers have no equivalent in any existing standard.** This is
the novel contribution.

## 4. Relationship to existing standards

AgentBOM is designed as a **complementary layer**, not a replacement:

| Standard | Scope | AgentBOM relationship |
|---|---|---|
| **CycloneDX** (OWASP/ECMA-424) | Software component BOM + ML-BOM extension | AgentBOM extends into agentic operational surfaces that CycloneDX ML-BOM does not cover (tool permissions, prompt provenance, workflow definitions). An AgentBOM can reference a CycloneDX document via `evidence_layer`. |
| **SPDX 3.0** (Linux Foundation) | Software package BOM + AI/dataset extensions | Similar complementarity. AgentBOM can cross-reference SPDX documents for package-level dependencies while covering agentic concerns. |
| **OWASP Agentic Top 10 2026** (ASI01–ASI10) | Risk taxonomy for agentic AI | AgentBOM's `risk_layer` and `tool_layer.risk_signals` can carry ASI identifiers, making the schema auditable against the OWASP taxonomy. |
| **NIST AI RMF** | AI risk management framework | AgentBOM fields map to AI RMF governance functions (Govern, Map, Measure, Manage). |
| **EU AI Act Annex IV** | Technical documentation for high-risk AI | AgentBOM fields directly address 8 of 29 Annex IV requirements with partial coverage of 12 more (see `docs/ai-act-annex-iv-mapping.md`). |
| **SLSA** (OpenSSF) | Supply-chain provenance | AgentBOM's `attestation` layer follows the same provenance model; a SLSA provenance statement can be linked from an AgentBOM. |
| **GUAC** (OpenSSF) | Supply-chain composition graph | An AgentBOM can be ingested by GUAC as a node in the artifact composition graph, adding agent-level edges that GUAC currently lacks. |

### Differentiation from CycloneDX ML-BOM

CycloneDX ML-BOM (v1.5+) captures:
- Model metadata (name, version, parameters, architecture)
- Dataset provenance (sources, preprocessing, labels)
- ML pipeline components (training, evaluation, deployment)

AgentBOM captures the **agentic operational layer** that wraps around the model:
- Tool inventory with permissions and risk signals
- Prompt provenance (hashes, versions, templates)
- Permission boundaries (data access, credential references, scopes)
- Workflow definitions (action pathways, step dependencies)
- Policy governance (content filters, rate limits, compliance rules)
- Runtime evidence links (AEP events, audit trail)

**These are complementary, not competing schemas.** A complete AI agent
deployment description uses both: CycloneDX ML-BOM for model/data lineage,
AgentBOM for agent-level operational composition.

## 5. OpenSSF mission alignment

The OpenSSF mission is to **secure open source software**. AI agents built on
open-source models, open-source tool frameworks (MCP), and open-source
orchestration layers represent a new class of software whose security posture
cannot be assessed with existing SBOM tooling.

AgentBOM directly advances the OpenSSF mission by:

1. **Supply chain visibility** — providing the first structured format for
   assessing the attack surface of AI agent deployments, analogous to how
   CycloneDX provides visibility for traditional software supply chains.
2. **Vulnerability management** — enabling tooling to scan agent compositions
   for permission escalation, excessive agency, and tool-level vulnerabilities.
3. **Risk assessment at scale** — giving procurement and security teams a
   machine-readable artifact for automated agent risk evaluation.
4. **Interoperability with OpenSSF projects** — AgentBOM artifacts can feed
   into GUAC (composition graph), be assessed by Scorecard (SBOM presence),
   and follow SLSA provenance models.
5. **Regulatory compliance** — providing a structured format that maps to
   EU AI Act Annex IV, ISO 42001, and NIST AI RMF, reducing compliance friction
   for organizations deploying AI agents.

## 6. Technical maturity

AgentBOM v0.1 is shipped with the following artifacts:

| Artifact | Status | Location |
|---|---|---|
| Human-readable specification | ✅ Shipped | `specs/agentbom/agentbom-v0.1.md` |
| JSON Schema (draft-07) | ✅ Shipped | `specs/agentbom/schema.json` |
| Reference validator (TypeScript) | ✅ Shipped | `packages/agentbom-core/` |
| Fixture-based conformance tests | ✅ Shipped | `packages/agentbom-core/src/index.test.ts` |
| CLI (validate, inspect, diff) | ✅ Shipped | `cli/` (`trust-cli agentbom ...`) |
| Worked examples | ✅ Shipped | `examples/agentbom-demo/`, `examples/bscode-agent/` |
| EU AI Act Annex IV mapping | ✅ Draft | `docs/ai-act-annex-iv-mapping.md` |
| Companion spec (AgentListing) | ✅ Research preview | `specs/agentbom/AgentListing.md` |
| License | Apache-2.0 | `LICENSE` |

### Adoption prerequisites

OpenSSF sandbox entry requires:

| Requirement | Status | Notes |
|---|---|---|
| ≥ 3 maintainers | ⚠️ Pending | Current maintainers are from WasmAgent org. Recruiting maintainers from ≥ 2 external organizations is required before filing. |
| ≥ 2 organization affiliations | ⚠️ Pending | Same as above — external maintainer recruitment needed. |
| WG or TAC sponsor | ⚠️ Pending | Target: AI/ML Security WG member. Outreach not yet started. |
| Linux Foundation IP/license review | ⚠️ Pending | Apache-2.0 license is compatible, but formal LF review is required for existing code contribution. |
| Novel approach / unfulfilled need | ✅ Met | Six of eleven AgentBOM layers have no equivalent in existing standards (see Section 3). |

## 7. Proposed pathway

### Primary: OpenSSF AI/ML Security Working Group (sandbox)

The **[AI/ML Security WG](https://openssf.org/groups/ai-ml-security/)** covers
securing the ML supply chain from data to deployment. AgentBOM directly
addresses the deployment-time composition visibility gap in the ML supply chain.

**Submission steps:**

1. **Recruit external maintainers** — identify ≥ 2 maintainers from
   organizations outside WasmAgent who are willing to contribute to the
   specification. Target profiles: security researchers, AI governance leads,
   open-source foundation contributors.
2. **Engage AI/ML Security WG** — present AgentBOM at a bi-weekly WG meeting,
   solicit feedback, and identify a sponsor willing to attend project meetings.
3. **File sandbox proposal** — submit a PR to
   [`ossf/tac`](https://github.com/ossf/tac) using the
   [sandbox template](https://github.com/ossf/tac/tree/main/process/templates),
   including the technical maturity table and maintainer roster.
4. **IP/license review** — file an issue in `ossf/tac` requesting Linux
   Foundation IP due diligence for the existing codebase contribution.
5. **TAC review and vote** — respond to TAC feedback and iterate on the
   proposal as needed.

### Secondary: OWASP CycloneDX ecosystem

If the OpenSSF pathway encounters barriers (e.g., scope overlap concerns with
CycloneDX), an alternative is to propose AgentBOM as an **extension profile** to
CycloneDX ML-BOM under OWASP. This would:

- Define a CycloneDX extension XML namespace for agentic fields
- Maintain AgentBOM as a standalone JSON schema that maps 1:1 to the extension
- Leverage CycloneDX's existing tooling ecosystem (validators, generators, scanners)

**Precedent:** CycloneDX already supports extension mechanisms (custom properties,
XML namespaces). The ML-BOM extension itself demonstrates this pattern.

### Tertiary: Direct ISO/IEC contribution

Long-term, if AgentBOM gains adoption through OpenSSF or OWASP, it can be
contributed to ISO/IEC as part of the **ISO/IEC 42001** AI management system
ecosystem or as a standalone PAS (Publicly Available Specification). This is
a Phase 8+ consideration.

## 8. Cross-org coordination notes

Standardization of AgentBOM involves sibling repositories in the WasmAgent
ecosystem:

| Repo | Role in standardization |
|---|---|
| `agent-trust-infra` (this repo) | Specification, schema, reference validator |
| `wasmagent-js` | Runtime AgentBOM generation, MCP posture integration |
| `open-agent-audit` | AgentBOM → regulatory control mapping, audit reports |
| `wasmagent` | Release ledger, public production status |

**If AgentBOM becomes a standalone repo or OpenSSF project**, the
specification schema and reference validator would migrate. Runtime
implementations remain in `wasmagent-js`; audit mapping remains in
`open-agent-audit`. See `docs/project-boundaries.md` for split criteria.

## 9. Key references

| Resource | URL |
|---|---|
| AgentBOM v0.1 specification | `specs/agentbom/agentbom-v0.1.md` |
| AgentBOM JSON Schema | `specs/agentbom/schema.json` |
| Reference implementation | `packages/agentbom-core/` |
| Worked examples | `examples/agentbom-demo/`, `examples/bscode-agent/` |
| EU AI Act Annex IV mapping | `docs/ai-act-annex-iv-mapping.md` |
| Architecture overview | `docs/architecture.md` |
| Strategic positioning | `docs/strategy.md` |
| Project vision | `docs/vision.md` |
| Project boundaries / split criteria | `docs/project-boundaries.md` |
| OpenSSF TAC Project Lifecycle | https://github.com/ossf/tac/blob/main/process/project-lifecycle.md |
| OpenSSF AI/ML Security WG | https://openssf.org/groups/ai-ml-security/ |
| OpenSSF SBOM Everywhere SIG | https://openssf.org/technical-initiatives/sbom-tools/ |
| OWASP CycloneDX | https://owasp.org/www-project-cyclonedx/ |
| OWASP Agentic Top 10 2026 | https://genai.owasp.org/ |
| MCPS sandbox proposal (precedent) | https://github.com/ossf/tac/issues/583 |
| SPDX 3.0 specification | https://spdx.dev/ |
| NIST AI RMF | https://www.nist.gov/itl/ai-risk-management-framework |
| ISO/IEC 42001 | https://standards.iso.org/ |

## 10. Next actions

| # | Action | Owner | Deadline |
|---|---|---|---|
| 1 | Publish this proposal as `docs/openssf-proposal.md` | WasmAgent | 2026-07-19 |
| 2 | Post proposal to OpenSSF AI/ML Security WG discussion forum | WasmAgent | 2026-07-26 |
| 3 | Present at AI/ML Security WG bi-weekly meeting | WasmAgent | 2026-08-09 |
| 4 | Recruit ≥ 2 external maintainers from separate orgs | WasmAgent | 2026-09-01 |
| 5 | Secure WG sponsor commitment | Sponsor (TBD) | 2026-09-15 |
| 6 | File sandbox proposal PR to `ossf/tac` | WasmAgent + sponsor | 2026-09-30 |
| 7 | Complete Linux Foundation IP/license review | LF / WasmAgent | 2026-10-31 |
| 8 | TAC vote and sandbox acceptance | TAC | 2026-11-30 |

**Estimated timeline:** ~4 months from proposal publication to sandbox
acceptance, assuming sponsor recruitment succeeds within 6 weeks.

## Appendix A: AgentBOM schema structure

```
AgentBOM v0.1
├── identity             — agent ID, name, version, deployment context
├── model_layer         — model provider, model ID, version, capabilities
├── tool_layer[]        — registered tools, MCP servers, skills, permissions
├── prompt_layer        — system prompt hashes, prompt versions, templates
├── permission_layer     — granted scopes, data access, credential references
├── policy_definitions[] — governance policies, constraints, compliance rules
├── evidence_layer       — AEP event references, runtime evidence hashes
├── audit_log[]         — structured audit trail entries
├── risk_layer[]        — known risk signals, severity, category, status
├── workflow_layer[]    — action pathway definitions (steps, dependencies)
└── attestation          — generator, timestamp, hash, signature
```

## Appendix B: Comparison with MCPS proposal

The [MCPS (MCP Secure) proposal](https://github.com/ossf/tac/issues/583) filed
March 2026 targets MCP protocol-level security (authentication, authorization,
transport encryption). AgentBOM is **complementary** — MCPS secures the MCP
transport layer; AgentBOM documents the agent's full composition *including* MCP
tool registrations, their permissions, and associated risk signals. The two
proposals address different layers and could coexist under the AI/ML Security
WG.
