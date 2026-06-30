# Roadmap

> **Status: public research preview.** The Week 0–12 items below are complete — they record what this repository already ships (public repo, README with research-preview status, specs, JSON schemas, validators, and the end-to-end trust-chain demo), not outstanding work. Later split and federation work is tracked as follow-up issues.

## Weeks 0–2: Public repository and spec skeletons

**Goal:** Public repo exists. README clearly communicates research preview status. Three specs have initial skeletons.

- [x] Create WasmAgent/agent-trust-infra
- [x] Add README with research preview status
- [x] Add [docs/vision.md](./vision.md)
- [x] Add [docs/architecture.md](./architecture.md)
- [x] Add [docs/project-boundaries.md](./project-boundaries.md)
- [x] Add [docs/external-trends.md](./external-trends.md)
- [x] Add [docs/relationship-to-wasmagent.md](./relationship-to-wasmagent.md)
- [x] Add [specs/agentbom/agentbom-v0.1.md](../specs/agentbom/agentbom-v0.1.md)
- [x] Add [specs/mcp-posture/posture-model-v0.1.md](../specs/mcp-posture/posture-model-v0.1.md)
- [x] Add [specs/trust-passport/passport-v0.1.md](../specs/trust-passport/passport-v0.1.md)
- [x] Add example placeholders

## Weeks 2–6: Working examples

**Goal:** The repo contains working examples of all three artifacts that can be validated.

- [x] Add schema.json for AgentBOM
- [x] Add schema.json for MCP Posture
- [x] Add schema.json for Trust Passport
- [x] Add sample AgentBOM for bscode agent workload
- [x] Add sample MCP posture snapshot
- [x] Add sample Trust Passport
- [x] Implement basic validation commands (AgentBOM, MCP Posture, Trust Passport)
- [x] Add fixture-based tests

**Acceptance criteria:**
```bash
bun test
agent-trust agentbom validate examples/agentbom-demo/agentbom.json
agent-trust mcp-posture validate examples/mcp-risk-demo/posture.json
agent-trust passport validate examples/passport-demo/trust-passport.json
```

## Weeks 6–12: End-to-end demo

**Goal:** Show the full Agent Trust Infrastructure chain.

```
bscode workload
        ↓
CapabilityManifest + AEP sample
        ↓
AgentBOM
        ↓
MCP Posture
        ↓
open-agent-audit report reference
        ↓
Trust Passport
```

- [x] Add bscode demo fixture
- [x] Add generated AgentBOM sample from CapabilityManifest
- [x] Add posture snapshot and posture diff
- [x] Add audit report reference hash
- [x] Add Trust Passport sample with validity model
- [x] Add architecture diagram
- [x] Add short technical report in papers/

## Future: Split criteria

See [project-boundaries.md](./project-boundaries.md) for criteria governing when AgentBOM, MCP Posture, or Trust Passport may be split into standalone repositories.
