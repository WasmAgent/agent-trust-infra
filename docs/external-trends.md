# External Trends

This document summarizes why Agent Trust Infrastructure is timely and what external
developments support it. Last reviewed: 2026-07-13.

## Regulatory timeline — two converging deadlines

### EU AI Act — 2026-08-02

Article 11 + Annex IV of the EU AI Act requires technical documentation for
high-risk AI systems. This takes effect **2026-08-02** for systems in Annex III
(with a possible delay to 2027-12 under the Digital Omnibus proposal, but that is
not confirmed as of this writing).

Annex IV documentation requirements include: model architecture, training data,
validation procedures, risk management documentation, and a description of
"monitoring, functioning, and control" of the AI system.

AgentBOM is structurally positioned to satisfy several of these requirements —
but only once there is an explicit mapping table (tracked in issue #171).

**Action**: produce `specs/agentbom/ai-act-annex-iv-mapping.md` before 2026-08-02.
This is the single highest-value near-term output: externally verifiable, citable,
and immediately useful to procurement teams.

### CycloneDX ML-BOM / SPDX 3.0 — procurement pressure

CycloneDX ML-BOM is already cited in procurement RFPs as "the AIBOM standard."
SPDX 3.0 (arXiv:2504.16743) has added AI/dataset BOM extensions.

The 2026-03 Oxford/Cisco paper (arXiv, "Implementing AIBOM for Agentic AI") argues
that traditional AIBOM covers model + data but misses **action pathway artifacts**:
tool skills, prompt versions, policy definitions, workflow definitions. Their
CycloneDX/SPDX schema extension proposal is the reference to align with.

AgentBOM can establish the first working "action pathway aware" schema before
CycloneDX formalizes this — first-mover position that reduces future migration cost.

## Agent risk is shifting from model risk to runtime supply-chain risk

AI agents do not just answer questions. They call tools, access memory, use
credentials, connect to MCP servers, delegate to sub-agents, and execute external
actions. Agent risk cannot be understood only as model-level security.

Key developments:

- **AgentRiskBOM** (arxiv 2606.21877) frames agentic AI system risk as an additive
  layer beyond SBOM/AIBOM/MLBOM, adding autonomy, tool permissions, memory,
  credential scope, approval gates, audit signals, inter-agent communication, and
  external action capability.
- **SkillFortify** (arxiv 2603.00195) identifies agent skills and tools as a
  supply-chain attack surface requiring dependency graphs, lockfile semantics,
  capability sandboxing, and trust scoring.
- **Zero-Trust Runtime Architecture** (arxiv 2602.19555) extends the agent attack
  surface from static model supply chain to dynamic runtime architecture, emphasizing
  cryptographic provenance and deterministic capability binding.

## OWASP Agentic Top 10 2026

OWASP has published a Top 10 for Agentic Applications (2026) that treats autonomous
agentic AI systems as a distinct risk object, separate from the LLM Top 10.

ASI01 (Agent Goal Hijack / tool poisoning) through ASI10 cover the major MCP and
multi-agent risk patterns. This is the vocabulary security teams will use when
evaluating any agentic system.

**Action**: MCP Posture's risk taxonomy must cross-reference ASI IDs. Without this,
security teams evaluating MCP Posture will not be able to map findings to their
existing frameworks. Tracked in `docs/roadmap.md` Phase 5.

## MCP 2026-07-28 — stateless handle model

The MCP final specification (2026-07-28) introduces:
- Stateless architecture with portable "handle" per request (replaces long-lived sessions)
- `MCP-Method` and `MCP-Name` HTTP headers naming the operation and target
- MCP Apps for rich UI interactions
- Async long-running tasks

Security implications documented by Akamai:
- Developers may accidentally map secrets/PII into `MCP-Method`/`MCP-Name` headers
  (these headers are new and not yet understood as security-sensitive)
- Protocol desync attacks
- XSS via MCP Apps
- DoS via long-running tasks

**For MCP Posture**: the stateless handle model means posture snapshots are now
per-request rather than per-session. Schema adaptation tracked in issue #173.
The `MCP-Method`/`MCP-Name` header leakage pattern should be a named risk entry
in the posture risk taxonomy.

Microsoft's official MCP security guidance now requires MCP servers to be treated
as **OAuth 2.0 resource servers** with audience-bound tokens, PKCE, and per-client
consent to prevent "confused deputy" attacks. MCP Posture's posture schema should
include an `audience_bound_token_enforced` field.

## Competitors will enter runtime governance

Microsoft Agent Governance Toolkit and adjacent projects are positioning policy
enforcement, zero-trust identity, execution sandboxing, and audit logging as agent
governance.

wasmagent's differentiation remains:

```
runtime-generated trust artifacts
  + evidence-linked audit chain
  + open schema / reference implementation
```

The strategic positioning is complementary: Microsoft's toolkit decides "should this
agent be allowed to run"; this repository documents "what this agent is made of and
what it can do" so that authorization decisions are grounded in verifiable facts.

## OTel GenAI and MCP conventions as evidence ingestion layer

OpenTelemetry GenAI semantic conventions and MCP semantic conventions are becoming
the standard adapter layer for agent and LLM observability. OTel traces can be
compiled into AgentBOM inputs, MCP Posture snapshots, and Trust Passport evidence
references — making OTel the external evidence ingestion layer, not just an
observability adapter.

## References

- AgentRiskBOM: https://arxiv.org/abs/2606.21877
- SkillFortify: https://arxiv.org/abs/2603.00195
- Zero-Trust Runtime Architecture: https://arxiv.org/abs/2602.19555
- SPDX 3.0 AI BOM: https://arxiv.org/abs/2504.16743
- OWASP Top 10 for Agentic Applications 2026: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- OWASP Agentic Skills Top 10: https://owasp.org/www-project-agentic-skills-top-10/
- OpenTelemetry GenAI conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/
- OpenTelemetry MCP conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- Microsoft Agent Governance Toolkit: https://github.com/microsoft/agent-governance-toolkit
