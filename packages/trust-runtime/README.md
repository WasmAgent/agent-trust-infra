# @wasmagent/trust-runtime

Trust runtime enforcement for MCP servers — experimental

## Overview

This package provides runtime enforcement capabilities for Agent Trust Infrastructure:

- **AgentBOM Runtime Validation**: Validate tool invocations and permission requests against a declared AgentBOM
- **MCP Server Decorator**: Wrap MCP servers with posture enforcement based on declared capabilities and risk categories

## Installation

```bash
npm install @wasmagent/trust-runtime@1.0.0-rc.1
```

## Usage

### AgentBOM Runtime Validation

```typescript
import { createRuntimeValidator } from '@wasmagent/trust-runtime';

// Create a validator from an AgentBOM
const validator = createRuntimeValidator(agentBOM);

if (validator) {
  // Validate a tool invocation
  const result = validator.validateToolInvocation({
    tool_id: 'tool-123',
    tool_name: 'read_file',
    permissions: ['fs:read']
  });

  if (result.valid) {
    console.log('Tool invocation allowed');
  } else {
    console.error('Validation errors:', result.errors);
  }
}
```

### MCP Server Decorator

```typescript
import { 
  MCPServerDecorator, 
  createDecoratedServer,
  PostureEnforcementConfig 
} from '@wasmagent/trust-runtime';

// Configure posture enforcement
const config: PostureEnforcementConfig = {
  maxRiskSeverity: 'high',
  blockedCategories: ['ssrf', 'exfiltration'],
  allowUnverified: false
};

// Create a decorated server
const decorator = createDecoratedServer(serverData, config);

// Check if a tool call is allowed
const result = decorator.enforceToolAccess('tool-123');
if (result.allowed) {
  // Execute the tool
} else {
  console.log('Tool blocked:', result.reason);
}
```

## API Reference

### RuntimeValidator

Interface for validating runtime requests against an AgentBOM.

- `validateToolInvocation(invocation: ToolInvocation): ValidationResult`
- `validatePermissionScope(request: PermissionRequest): ValidationResult`
- `validateRuntimeRequest(request: RuntimeRequest): ValidationResult`

### MCPServerDecorator

Wraps an MCP server with posture enforcement.

- `enforceToolAccess(toolId: string): EnforcementResult`
- `getAllowedTools(): MCPTool[]`
- `getUndecoratedServer(): MCPServer`

### Utility Functions

- `createRuntimeValidator(agentBOM): RuntimeValidator | null`
- `createDecoratedServer(serverData, config): MCPServerDecorator`
- `decorateServerFromPosture(postureData, serverId, config): MCPServerDecorator`
- `enforcePostureOnServers(servers, config): MCPServerDecorator[]`
- `checkToolAccessAcrossServers(decorators, toolId): { allowed, results }`
- `summarizeEnforcementState(decorators): string`

## Dependencies

- `@wasmagent/agentbom-core`: AgentBOM validation
- `@wasmagent/mcp-posture-core`: MCP posture validation

## License

Apache-2.0

## Status

**Experimental research preview** — not production software. Part of the Agent Trust Infrastructure research preview. See [agent-trust-infra](https://github.com/WasmAgent/agent-trust-infra) for details.
