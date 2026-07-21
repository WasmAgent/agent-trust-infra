# @wasmagent/trust-cli

CLI for Agent Trust Infrastructure — AgentBOM generation, MCP Posture analysis, and compliance checking.

> **Experimental research preview.** Not production software. See the
> [main repo README](https://github.com/WasmAgent/agent-trust-infra) for the
> full project overview.

## Local development

This CLI is an experimental reference prototype in the `agent-trust-infra`
incubation repo. It is not published to npm from this repository.

```sh
npm install --frozen-lockfile
npm run build
bun cli/src/index.ts <command> [args]
```

Requires Node.js >= 18 and Bun.

Two binary names are provided:

```sh
agent-trust <command> [args]
# or
trust-cli <command> [args]
```

## Commands

### AgentBOM

```sh
agent-trust generate bom --agent <path>    # Generate an AgentBOM manifest
agent-trust agentbom inspect <path>         # Inspect an AgentBOM file
agent-trust agentbom diff <old> <new>        # Diff two AgentBOM files
agent-trust agentbom pipeline <path>        # Stream-process BOM artifacts
```

### MCP Posture

```sh
agent-trust generate posture --agent <path>  # Generate an MCP Posture report
agent-trust mcp-posture inspect <path>        # Inspect an MCP Posture file
```

### Validation & Compliance

```sh
agent-trust validate <artifact.json>          # Validate against published schemas
agent-trust compliance-check <artifact.json>  # Run compliance profile checks
```

### Trust Chain

```sh
agent-trust chain                             # Run the full trust chain demo
```

## Release boundary

This repository may keep reference CLI prototypes for local validation,
examples, and demos, but direct npm publishing and production binary releases
belong in target repositories after the relevant schemas and runtime scanning
primitives stabilize.

AgentBOM CLI release automation moves to standalone `WasmAgent/agentbom` after
schema stabilization. MCP Posture CLI release automation moves to
`WasmAgent/wasmagent-js` after runtime scanning primitives stabilize.

## License

MIT
