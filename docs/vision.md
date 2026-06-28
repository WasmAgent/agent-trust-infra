# Vision

## What we are building

Agent Trust Infrastructure is a set of open specifications and reference implementations for generating, validating, and auditing trust artifacts for AI agents.

The three core artifacts are:

| Artifact | Question it answers |
|---|---|
| AgentBOM | What is this agent made of? |
| MCP Posture | What is the agent's tool and permission attack surface? |
| Trust Passport | What is the agent's current trust state, and when does it expire? |

## Why trust artifacts matter

AI agents are not just models. They are deployable systems with tools, permissions, model dependencies, runtime policies, MCP servers, credential scopes, and audit evidence chains.

Existing frameworks answer the wrong question. SBOM answers "what code is running." AIBOM answers "what model is running." Neither answers "what can this agent do, what risks exist, and what evidence supports its trust claims."

Agent Trust Infrastructure fills this gap by generating runtime-derived trust artifacts that are:

- **Evidence-linked** — grounded in runtime facts, not just configuration declarations
- **Auditable** — structured for audit report integration
- **Verifiable** — designed for cryptographic reference, not raw trace exposure
- **Expiring** — modeled with validity periods and renewal triggers

## Relationship to other WasmAgent projects

AgentBOM and MCP Posture are generated from runtime data produced by `wasmagent-js`. Trust Passport summarizes audit evidence from `open-agent-audit`. This repository incubates the specifications and prototypes; production integration lives in `wasmagent-js` and `open-agent-audit / Trustavo`.
