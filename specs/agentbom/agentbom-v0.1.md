# AgentBOM v0.1 Specification

> Status: shipped v0.1 specification. The schema and reference validator are
> published in this repository; implementation maturity remains a research
> preview.

## What is AgentBOM?

AgentBOM is a bill of materials for AI agents.

It describes the deployed composition of an agent, including model dependencies, MCP servers, tool surfaces, prompt references, permission scopes, data access boundaries, evidence references, and known risk signals.

AgentBOM is not an audit report. It is an input artifact for audit, posture analysis, procurement review, and trust passport issuance.

## Relationship to existing standards

### SBOM (CycloneDX, SPDX)

Software Bill of Materials standards such as CycloneDX and SPDX catalog the libraries, frameworks, and dependencies that make up a software artifact. They answer the question "what components were shipped?" and are essential for vulnerability tracking and supply-chain integrity.

AgentBOM does not replace an SBOM. Instead, it extends the bill-of-materials concept into the operational layer of an AI agent. Where an SBOM lists static software components, AgentBOM captures **runtime authority surfaces**: which tools the agent can invoke, what permission scopes it holds, which data sources it may access, and what prompts govern its behavior. These dimensions are outside the scope of traditional SBOM formats, which have no fields for tool registrations, permission boundaries, or prompt provenance.

### AIBOM

AIBOM (AI Bill of Materials) initiatives focus on model lineage and dataset provenance — tracking which model weights, training data, and fine-tuning steps produced a given AI capability. This is critical for understanding model-level risks such as data poisoning, bias, and license compliance.

AgentBOM builds on the same bill-of-materials philosophy but shifts focus from the model itself to the **agent wrapper around the model**. An agent that calls a well-documented model can still introduce risk through overly broad tool permissions, unbounded data access, or insufficient prompt guardrails. AgentBOM captures these agent-level concerns — tool registries, permission scopes, prompt hashes, and runtime evidence — that AIBOM alone does not address.

### OWASP LLM Top 10

The OWASP LLM Top 10 catalogs the most critical security risks specific to large language model applications, including prompt injection, excessive agency, and data leakage. It serves as a risk awareness and mitigation guide.

AgentBOM does not duplicate the OWASP LLM Top 10 taxonomy. Rather, it provides a **structured, machine-readable artifact** that records whether a given agent deployment has mitigations and findings relevant to those risk categories. The `risk_layer` and `tool_layer.risk_signals` fields can reference OWASP LLM Top 10 categories (e.g., `prompt_injection`, `excessive_agency`), enabling automated tooling to check whether a deployment has acknowledged and addressed the applicable risks.

### What AgentBOM adds

The following capabilities are not captured by SBOM, AIBOM, or OWASP LLM Top 10 alone:

- **Tool registry and permissions**: A complete inventory of tools (MCP servers, built-in functions, plugins) alongside the permission scopes each tool requires.
- **Prompt provenance**: Cryptographic hashes of system prompts and template references, enabling integrity verification of the instructions governing agent behavior.
- **Permission boundaries**: Declared data access scopes, credential type references, and granted authority — the "blast radius" if the agent behaves unexpectedly.
- **Runtime evidence links**: References to AEP (Agent Evidence Protocol) events and evidence hashes that ground the AgentBOM in observed runtime behavior rather than declared intent alone.
- **Composability**: AgentBOM is designed to be diffed between versions, making it suitable for change-review workflows and continuous compliance monitoring.

### AgentBOM as input to audit

AgentBOM is an input artifact, not an audit report itself. In a typical audit workflow:

1. **Generation**: An AgentBOM is produced for each agent deployment, capturing the full composition at a point in time.
2. **Posture analysis**: Tools such as MCP Posture analyze the AgentBOM against policy rules and risk frameworks, producing findings.
3. **Evidence collection**: Runtime evidence (AEP events, invocation logs) is linked into the `evidence_layer`, grounding the static declaration in observed behavior.
4. **Audit review**: Auditors use the AgentBOM alongside posture findings and evidence to assess compliance, identify gaps, and verify mitigations.

### AgentBOM and the Trust Passport

The Trust Passport is a downstream artifact that summarizes the trust status of an agent for consumers such as procurement teams and platform operators. AgentBOM feeds into Trust Passport issuance by providing:

- **Identity and scope**: The agent's declared identity, version, and deployment context from `identity`.
- **Risk posture**: Aggregated risk signals from `risk_layer` and `tool_layer.risk_signals` that determine the passport's risk rating.
- **Evidence integrity**: Cryptographic hashes and AEP references from `evidence_layer` that allow the passport to make attested claims about runtime behavior.

Together, AgentBOM provides the detailed technical input while the Trust Passport provides the concise, consumer-facing trust summary.

## Schema structure

```
AgentBOM v0.1
├── identity         — agent ID, name, version, deployment context
├── model_layer      — model provider, model ID, version, capabilities
├── tool_layer       — registered tools, MCP servers, tool permissions
├── prompt_layer     — system prompt references, template IDs
├── permission_layer — granted scopes, data access boundaries, credential references
├── evidence_layer   — AEP event references, runtime evidence hashes
├── audit_log        — structured audit trail entries
├── risk_layer       — known risk signals, open findings
└── attestation      — generator, timestamp, hash
```

## identity

| Field | Type | Required | Description |
|---|---|---|---|
| `agentbom_version` | string | yes | Always `"0.1"` |
| `agent_id` | string | yes | Unique agent identifier |
| `agent_name` | string | yes | Human-readable name |
| `agent_version` | string | no | Semantic version |
| `deployment_context` | string | no | `development`, `staging`, `production` |
| `generated_at` | ISO 8601 | yes | Generation timestamp |

## model_layer

| Field | Type | Required | Description |
|---|---|---|---|
| `provider` | string | yes | Model provider |
| `model_id` | string | yes | Model identifier |
| `model_version` | string | no | Model version or snapshot |
| `capabilities` | string[] | no | Declared capabilities |

## tool_layer

Array of tool entries:

| Field | Type | Required | Description |
|---|---|---|---|
| `tool_id` | string | yes | Unique tool identifier |
| `tool_name` | string | yes | Tool name |
| `source` | string | yes | `mcp`, `builtin`, `plugin` |
| `mcp_server_id` | string | no | MCP server identifier if source is `mcp` |
| `permissions` | string[] | no | Permission scopes this tool requires |
| `risk_signals` | string[] | no | Known risk signals for this tool |

## prompt_layer

| Field | Type | Required | Description |
|---|---|---|---|
| `system_prompt_hash` | string | no | SHA-256 of system prompt |
| `template_ids` | string[] | no | Referenced prompt template IDs |

## permission_layer

| Field | Type | Required | Description |
|---|---|---|---|
| `granted_scopes` | string[] | no | All granted permission scopes |
| `data_access` | string[] | no | Data sources the agent can access |
| `credential_references` | string[] | no | Credential type references (no secrets) |

## evidence_layer

| Field | Type | Required | Description |
|---|---|---|---|
| `aep_references` | string[] | no | AEP event IDs or hashes |
| `evidence_hashes` | object[] | no | `{type, hash, timestamp}` |

## audit_log

Array of audit trail entries:

| Field | Type | Required | Description |
|---|---|---|---|
| `timestamp` | ISO 8601 | yes | Event timestamp |
| `event_type` | string | yes | Type of audit event (e.g., `tool_call`, `permission_check`, `prompt_injection_attempt`) |
| `actor` | string | yes | Entity that performed the action (user ID, system component, or external service) |
| `resource` | string | no | Target resource identifier affected by the event |
| `outcome` | string | no | `success`, `failure`, or `partial` |
| `details` | object | no | Additional event-specific context and metadata |

## risk_layer

Array of risk entries:

| Field | Type | Required | Description |
|---|---|---|---|
| `risk_id` | string | yes | Unique risk identifier |
| `severity` | string | yes | `critical`, `high`, `medium`, `low`, `info` |
| `category` | string | yes | Risk category |
| `description` | string | yes | Risk description |
| `status` | string | yes | `open`, `mitigated`, `accepted` |

## attestation

| Field | Type | Required | Description |
|---|---|---|---|
| `generator` | string | yes | Tool or process that generated this AgentBOM |
| `generator_version` | string | no | Generator version |
| `agentbom_hash` | string | no | SHA-256 of canonical AgentBOM JSON |

## CLI commands

```bash
agent-trust agentbom validate <path>    # Validate against schema
agent-trust agentbom inspect <path>     # Human-readable summary
agent-trust agentbom diff <old> <new>   # Show changes between two AgentBOMs
```
