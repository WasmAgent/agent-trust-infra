# @wasmagent/trust-cli

CLI for Agent Trust Infrastructure — AgentBOM generation, MCP Posture analysis, and compliance checking.

> **Experimental research preview.** Not production software. See the
> [main repo README](https://github.com/WasmAgent/agent-trust-infra) for the
> full project overview.

## Install

```sh
npm install -g @wasmagent/trust-cli
```

Requires Node.js >= 18.

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

## Standalone binaries

Pre-compiled standalone binaries are attached to each [GitHub Release](https://github.com/WasmAgent/agent-trust-infra/releases). Download the binary for your platform:

| Platform | Binary |
|---|---|
| Linux x64 | `trust-cli-linux-x64` |
| Linux arm64 | `trust-cli-linux-arm64` |
| macOS x64 | `trust-cli-darwin-x64` |
| macOS arm64 (Apple Silicon) | `trust-cli-darwin-arm64` |
| Windows x64 | `trust-cli-win32-x64.exe` |

## License

MIT
