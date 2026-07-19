# @wasmagent/mcp-posture-core

MCP Posture reference implementation — schema validation, inspection, and drift
detection for MCP-connected agent security posture snapshots.

> **Status**: experimental research preview. The schema is authoritative;
> the TypeScript implementation is a reference validator.

## What is MCP Posture?

MCP Posture captures the **attack surface and permission state** of an
MCP-connected AI agent in a structured JSON snapshot. It answers:

- Which MCP servers is this agent connected to?
- Which tools does each server expose, and what permissions do they require?
- Which tools carry high-risk signals (SSRF, exfiltration, command execution,
  privilege escalation, prompt injection, credential access, supply chain,
  MCP header leakage)?
- Has the permission surface changed since the last snapshot (drift)?

MCP Posture is **not** a one-time scan result — it is a continuous posture state
with historical tracking. See the full specification at
[`specs/mcp-posture/posture-model-v0.1.md`](../../specs/mcp-posture/posture-model-v0.1.md).

## Installation

```bash
# Within the agent-trust-infra monorepo (bun workspaces)
bun install
```

The package has zero runtime dependencies.

## API

### `validateMCPPosture(data: unknown): ValidationResult`

Validates a posture snapshot against the v0.1 schema requirements.

```ts
import { validateMCPPosture } from '@wasmagent/mcp-posture-core';

const result = validateMCPPosture(postureData);
if (!result.valid) {
  console.error(result.errors);
}
```

### `inspectMCPPosture(data: Record<string, unknown>): string`

Produces a human-readable summary of a posture snapshot: server count, tool
count, high-risk tools, and risk findings with OWASP Agentic Top 10 references.

```ts
import { inspectMCPPosture } from '@wasmagent/mcp-posture-core';

console.log(inspectMCPPosture(postureData));
// MCP Posture v0.1 (protocol: 2026-07-28)
//   Snapshot:        posture-001
//   Agent:           my-agent
//   Servers:         3
//   Tools:           12
//   High-risk tools: 4
//   Risks:           6
```

### `diffMCPPosture(old, new): PostureDiff`

Computes the structural diff between two posture snapshots — detecting added
or removed servers, tools, permission scopes, and risk findings.

```ts
import { diffMCPPosture, formatPostureDiff } from '@wasmagent/mcp-posture-core';

const diff = diffMCPPosture(oldPosture, newPosture);
if (!diff.isEmpty()) {
  console.log(formatPostureDiff(diff));
}
```

### `RISK_CATEGORIES`

Canonical enum of 8 risk categories:

```ts
import { RISK_CATEGORIES } from '@wasmagent/mcp-posture-core';
// ['ssrf', 'exfiltration', 'command_execution',
//  'privilege_escalation', 'prompt_injection',
//  'credential_access', 'supply_chain', 'mcp_header_leakage']
```

### Type exports

| Type | Description |
|---|---|
| `ValidationResult` | `{ valid: boolean; errors: string[] }` |
| `PostureDiff` | Structured diff with servers, tools, permissions, risks |
| `RiskCategory` | Union of the 8 risk category strings |
| `SessionModel` | `'stateful' \| 'stateless-handle' \| 'unknown'` |
| `HandleExpiryPolicy` | `'short-lived' \| 'long-lived' \| 'unset'` |
| `McpPostureAuth` | OAuth auth fields for MCP 2026-07-28 |

## CLI

The `agent-trust` CLI (in `cli/`) provides MCP Posture commands:

```bash
agent-trust mcp-posture validate <path>    # Validate against schema
agent-trust mcp-posture inspect <path>    # Human-readable summary
agent-trust mcp-posture diff <old> <new>  # Show posture drift
```

## Relationship to other packages

This package owns the **schema and reference validator**. It does not perform
live MCP scanning or runtime enforcement.

| Concern | Package |
|---|---|
| MCP traffic filtering / gating | `@wasmagent/mcp-gateway` (wasmagent-js) |
| Capability attestation | `@wasmagent/mcp-attestation` (wasmagent-js) |
| Audit report generation | `@openagentaudit/core` (open-agent-audit) |
| Trust Passport issuance | `@openagentaudit/passport` (open-agent-audit) |
| **Schema + validator (this package)** | `@wasmagent/mcp-posture-core` |

## Schema

The authoritative JSON Schema is at [`specs/mcp-posture/schema.json`](../../specs/mcp-posture/schema.json).
The TypeScript validator checks a subset of schema requirements; the JSON Schema
is the conformance standard for tooling integration.

## License

See repository root for license information.
