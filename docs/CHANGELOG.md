# Changelog

Released features and shipped artifacts for `agent-trust-infra`.

This is a record of what the repository already ships — **not** outstanding
work. Active and future work is tracked in [`roadmap.md`](./roadmap.md).

## Research preview — Weeks 0–12

The Week 0–12 milestones below are complete. They record what this repository
already ships (public repo, README with research-preview status, specs, JSON
schemas, validators, and the end-to-end trust-chain demo), not outstanding work.
This close-out is represented by the merged PRs: the spec and skeleton work
(e.g. #25, #28), the working examples and validators (e.g. #31, #35, #37), and
the end-to-end Weeks 6–12 visualization and runnable demo close-out (#41, #42).

### Weeks 0–2: Public repository and spec skeletons

**Goal:** Public repo exists. README clearly communicates research preview
status. Three specs have initial skeletons.

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

### Weeks 2–6: Working examples

**Goal:** The repo contains working examples of all three artifacts that can be
validated.

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

### Weeks 6–12: End-to-end demo

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

## Shipped specs and schemas

These specifications and their JSON schemas are part of the public research
preview and are shipped from this repository:

| Artifact | Specification | Schema |
|---|---|---|
| AgentBOM | [agentbom-v0.1.md](../specs/agentbom/agentbom-v0.1.md) | [schema.json](../specs/agentbom/schema.json) |
| MCP Posture | [posture-model-v0.1.md](../specs/mcp-posture/posture-model-v0.1.md) | [schema.json](../specs/mcp-posture/schema.json) |
| Trust Passport | [passport-v0.1.md](../specs/trust-passport/passport-v0.1.md) | [schema.json](../specs/trust-passport/schema.json) |

Supporting reference material shipped with the MCP Posture spec:
[MCP risk taxonomy](../specs/mcp-posture/risk-taxonomy.md).

The end-to-end chain is exercised by the `agent-trust chain` command and the
runnable demo at `examples/bscode-agent/run-chain.sh`, and summarized in the
technical report [Agent Trust Infrastructure](../papers/agent-trust-infrastructure.md).
