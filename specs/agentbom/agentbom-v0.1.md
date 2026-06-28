# AgentBOM v0.1 Specification

> Status: experimental draft. Subject to change.

## What is AgentBOM?

AgentBOM is a bill of materials for AI agents.

It describes the deployed composition of an agent, including model dependencies, MCP servers, tool surfaces, prompt references, permission scopes, data access boundaries, evidence references, and known risk signals.

AgentBOM is not an audit report. It is an input artifact for audit, posture analysis, procurement review, and trust passport issuance.

## Relationship to existing standards

| Standard | Focus | AgentBOM relationship |
|---|---|---|
| SBOM (CycloneDX, SPDX) | Software components | AgentBOM adds agent-specific runtime authority |
| AIBOM | Model and dataset lineage | AgentBOM extends with tools, permissions, runtime evidence |
| OWASP LLM Top 10 | Model-level risks | AgentBOM captures tool and permission attack surface |

## Schema structure

```
AgentBOM v0.1
├── identity         — agent ID, name, version, deployment context
├── model_layer      — model provider, model ID, version, capabilities
├── tool_layer       — registered tools, MCP servers, tool permissions
├── prompt_layer     — system prompt references, template IDs
├── permission_layer — granted scopes, data access boundaries, credential references
├── evidence_layer   — AEP event references, runtime evidence hashes
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
