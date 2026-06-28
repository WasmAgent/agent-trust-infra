# MCP Posture Model v0.1

> Status: experimental draft. Subject to change.

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
├── identity         — snapshot ID, agent ID, timestamp
├── servers          — connected MCP servers
│   └── tools        — tools per server with permissions and risk classification
├── permission_graph — aggregate permission surface
├── risk_summary     — taxonomy-mapped risk findings
├── drift            — changes since previous snapshot
└── attestation      — generator and snapshot hash
```

## Risk taxonomy

| Category | Description | OWASP MCP reference |
|---|---|---|
| `ssrf` | Server-side request forgery via network tools | MCP-02 |
| `exfiltration` | Data exfiltration via output or storage tools | MCP-04 |
| `command_execution` | Arbitrary command or code execution | MCP-01 |
| `privilege_escalation` | Permission scope expansion | MCP-03 |
| `prompt_injection` | Tool input that can manipulate agent behavior | MCP-05 |
| `credential_access` | Access to secrets or credentials | MCP-06 |
| `supply_chain` | Unverified MCP server provenance | MCP-07 |

## CLI commands

```bash
agent-trust mcp-posture validate <path>    # Validate against schema
agent-trust mcp-posture inspect <path>     # Human-readable summary
agent-trust mcp-posture diff <old> <new>   # Show posture drift
```
