# External Trends

This document summarizes why Agent Trust Infrastructure is timely and what external developments support it.

## Agent risk is shifting from model risk to runtime supply-chain risk

AI agents do not just answer questions. They call tools, access memory, use credentials, connect to MCP servers, delegate to sub-agents, and execute external actions.

Agent risk cannot be understood only as model-level security. It must be framed as runtime authority and runtime supply-chain risk.

Key developments:

- **AgentRiskBOM** (arxiv 2606.21877) frames agentic AI system risk as an additive layer beyond SBOM/AIBOM/MLBOM, adding autonomy, tool permissions, memory, credential scope, approval gates, audit signals, inter-agent communication, and external action capability.
- **SkillFortify** (arxiv 2603.00195) identifies agent skills and tools as a supply-chain attack surface requiring dependency graphs, lockfile semantics, capability sandboxing, and trust scoring.
- **Zero-Trust Runtime Architecture** (arxiv 2602.19555) extends the agent attack surface from static model supply chain to dynamic runtime architecture, emphasizing cryptographic provenance and deterministic capability binding.

## OWASP and MCP risk are becoming independent categories

**OWASP Top 10 for Agentic Applications 2026** treats autonomous agentic AI systems as a distinct risk object, separate from the LLM Top 10.

Key questions the emerging framework asks:

- Which tools can this agent call?
- Is the MCP server trustworthy?
- Are tool permissions over-scoped?
- Is there a prompt-to-tool exploit path?
- Is there an auditable evidence chain?
- Has permission or risk drift occurred?

These questions map directly to AgentBOM, MCP Posture, and Trust Passport.

## Competitors will enter runtime governance

Microsoft Agent Governance Toolkit and adjacent projects are positioning policy enforcement, zero-trust identity, execution sandboxing, reliability engineering, and audit logging as agent governance.

WasmAgent's differentiation is not a governance control plane. It is:

```
runtime-generated trust artifacts
  + evidence-linked audit chain
  + open schema / reference implementation
```

The strategic question is: how do you turn runtime agent facts into verifiable, auditable, reusable trust artifacts?

## OTel GenAI and MCP conventions as evidence ingestion layer

OpenTelemetry GenAI semantic conventions and MCP semantic conventions are becoming the adapter layer for agent and LLM observability.

For Agent Trust Infrastructure, OTel traces are not only logs. They can be compiled into:

- AgentBOM inputs
- MCP Posture snapshots
- Trust Passport evidence references

OTel should be treated as an external evidence ingestion layer, not just an observability adapter.

## References

- AgentRiskBOM: https://arxiv.org/abs/2606.21877
- SkillFortify: https://arxiv.org/abs/2603.00195
- Zero-Trust Runtime Architecture: https://arxiv.org/abs/2602.19555
- OWASP Top 10 for Agentic Applications 2026: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- OWASP Agentic Skills Top 10: https://owasp.org/www-project-agentic-skills-top-10/
- OpenTelemetry GenAI conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/
- OpenTelemetry MCP conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- Microsoft Agent Governance Toolkit: https://github.com/microsoft/agent-governance-toolkit
