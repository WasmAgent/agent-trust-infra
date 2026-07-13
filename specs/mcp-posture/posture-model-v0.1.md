# MCP Posture Model v0.1

> Status: shipped v0.1 specification. The schema and reference validator are
> published in this repository; implementation maturity remains a research
> preview.

## What is MCP Posture?

MCP Posture Management answers:

- Which MCP servers is this agent connected to?
- Which tools does each server expose?
- What permissions do those tools require?
- Which tools carry high-risk signals (SSRF, exfiltration, command execution, privilege escalation)?
- Has the permission surface changed since the last snapshot?
- Which findings should flow into audit reports?

MCP Posture is not a simple scan result. It is a continuous posture state with historical tracking.

## Posture pipeline

```
MCP server discovery
        ↓
Tool and permission classification
        ↓
Risk taxonomy mapping
        ↓
Permission graph
        ↓
Posture snapshot (this schema)
        ↓
Historical posture state (Trustavo)
        ↓
Audit evidence integration
```

## Schema structure

```
MCPPosture v0.1
├── identity              — snapshot ID, agent ID, timestamp
├── servers               — connected MCP servers
│   ├── session_model     — stateful | stateless-handle | unknown (MCP 2026-07-28)
│   ├── handle_expiry_policy — short-lived | long-lived | unset (stateless-handle only)
│   └── tools             — tools per server with permissions and risk classification
├── permission_graph      — aggregate permission surface
├── risk_summary          — taxonomy-mapped risk findings
│   └── owasp_agentic_ref — OWASP Agentic Top 10 (2026) ID (ASI01–ASI10)
├── drift                 — changes since previous snapshot
├── attestation            — generator and snapshot hash
│   └── auth              — audience-bound token validation (MCP 2026-07-28)
└── protocol_version      — MCP spec version (2025-03-26 | 2026-07-28)
```

## Risk taxonomy

| Category | Description | OWASP MCP reference | OWASP Agentic Top 10 (2026) |
|---|---|---|---|
| `ssrf` | Server-side request forgery via network tools | MCP-02 | ASI04 |
| `exfiltration` | Data exfiltration via output or storage tools | MCP-04 | ASI04 |
| `command_execution` | Arbitrary command or code execution | MCP-01 | ASI03 |
| `privilege_escalation` | Permission scope expansion | MCP-03 | ASI03 |
| `prompt_injection` | Tool input that can manipulate agent behavior | MCP-05 | ASI02 |
| `credential_access` | Access to secrets or credentials | MCP-06 | ASI04 |
| `supply_chain` | Unverified MCP server provenance | MCP-07 | ASI09 |
| `mcp_header_leakage` | Secrets or PII accidentally mapped into MCP-Method/MCP-Name HTTP headers | — | ASI04 |

## CLI commands

```bash
agent-trust mcp-posture validate <path>    # Validate against schema
agent-trust mcp-posture inspect <path>     # Human-readable summary
agent-trust mcp-posture diff <old> <new>   # Show posture drift
```
