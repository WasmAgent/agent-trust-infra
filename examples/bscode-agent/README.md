# bscode Agent Trust Demo

This example shows how AgentBOM, MCP Posture, and Trust Passport fit together for a bscode agent workload.

## Files

- `../agentbom-demo/agentbom.json` — AgentBOM describing the bscode agent composition
- `../mcp-risk-demo/posture.json` — MCP posture snapshot for the bscode agent's MCP servers
- `../passport-demo/trust-passport.json` — Trust Passport referencing the AgentBOM and posture

## Trust chain

```
bscode agent runtime
        ↓ composition facts
AgentBOM (agentbom-demo/agentbom.json)
        ↓ permission and tool surface
MCP Posture (mcp-risk-demo/posture.json)
        ↓ [future] open-agent-audit report reference
Trust Passport (passport-demo/trust-passport.json)
```

## Validate

```bash
agent-trust agentbom validate examples/agentbom-demo/agentbom.json
agent-trust mcp-posture validate examples/mcp-risk-demo/posture.json
agent-trust passport validate examples/passport-demo/trust-passport.json
```

## Notes

These are demo fixtures only. The hashes are placeholders. This is not a real audit or real trust assessment.
