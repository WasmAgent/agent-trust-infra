# Roadmap

## Weeks 0–2: Public repository and spec skeletons

**Goal:** Public repo exists. README clearly communicates research preview status. Three specs have initial skeletons.

- [x] Create WasmAgent/agent-trust-infra
- [x] Add README with research preview status
- [x] Add docs/vision.md
- [x] Add docs/architecture.md
- [x] Add docs/project-boundaries.md
- [x] Add docs/external-trends.md
- [x] Add docs/relationship-to-wasmagent.md
- [ ] Add specs/agentbom/agentbom-v0.1.md
- [ ] Add specs/mcp-posture/posture-model-v0.1.md
- [ ] Add specs/trust-passport/passport-v0.1.md
- [ ] Add example placeholders

## Weeks 2–6: Working examples

**Goal:** The repo contains working examples of all three artifacts that can be validated.

- [ ] Add schema.json for AgentBOM
- [ ] Add schema.json for MCP Posture
- [ ] Add schema.json for Trust Passport
- [ ] Add sample AgentBOM for bscode agent workload
- [ ] Add sample MCP posture snapshot
- [ ] Add sample Trust Passport
- [ ] Implement basic validation commands (AgentBOM, MCP Posture, Trust Passport)
- [ ] Add fixture-based tests

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

- [ ] Add bscode demo fixture
- [ ] Add generated AgentBOM sample from CapabilityManifest
- [ ] Add posture snapshot and posture diff
- [ ] Add audit report reference hash
- [ ] Add Trust Passport sample with validity model
- [ ] Add architecture diagram
- [ ] Add short technical report in papers/

## Future: Split criteria

See [project-boundaries.md](./project-boundaries.md) for criteria governing when AgentBOM, MCP Posture, or Trust Passport may be split into standalone repositories.
