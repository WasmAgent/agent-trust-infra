# Agent Trust Infrastructure

Public research preview for Agent Trust Infrastructure: AgentBOM, MCP posture, and trust passport specifications for auditable AI agents.

> **Status: experimental research preview.**
> Not production software.
> Not a compliance certification product.

## Why this exists

AI agents are becoming deployable software systems with tools, permissions, model dependencies, runtime policies, and audit evidence.

Traditional logs and observability traces are not enough to answer enterprise trust questions:

- What is this agent made of?
- Which tools and MCP servers can it access?
- What permissions can it exercise?
- Which risks changed since the last review?
- Which audit evidence supports its trust claims?
- Is there a signed, expiring trust state that a buyer or reviewer can verify?

This repository explores three connected trust artifacts:

1. **AgentBOM** — a bill of materials for AI agents.
2. **MCP Posture** — attack surface and permission posture for MCP-connected agents.
3. **Trust Passport** — a signed, expiring, verifiable trust-state artifact.

## Relationship to WasmAgent

```
wasmagent-js
 runtime protection / MCP firewall / AEP emitter / CapabilityManifest
        ↓
Agent Trust Infrastructure
 AgentBOM / MCP Posture / Trust Passport specs and prototypes
        ↓
open-agent-audit / Trustavo
 evidence validation / audit report / framework mapping
        ↓
Trustavo Passport
 signed / expiring / verifiable trust state
 eventual product home: trustavo.com/passport
```

## Repository structure

```
agent-trust-infra/
├── docs/          — vision, architecture, boundaries, roadmap
├── specs/         — AgentBOM, MCP Posture, Trust Passport specifications
├── packages/      — TypeScript reference implementations
├── cli/           — agent-trust unified CLI
├── examples/      — demo fixtures and end-to-end demos
└── papers/        — technical reports
```

## Quick start

```bash
bun install
bun test

# Validate an AgentBOM
agent-trust agentbom validate examples/agentbom-demo/agentbom.json

# Validate a posture snapshot
agent-trust mcp-posture validate examples/mcp-risk-demo/posture.json

# Validate a Trust Passport
agent-trust passport validate examples/passport-demo/trust-passport.json
```

## Repository status

This repository is a public research preview.

The specifications and prototypes may change rapidly.
Do not treat any artifact here as a legal compliance certification, security certification, or production-grade audit attestation.

## License

Apache-2.0
