# Agent Framework Integration Guide

Auto-generate AgentBOM v0.1 manifests from LangChain, LlamaIndex, and AutoGen agent definitions using the official adapter packages.

## Packages

| Framework | Package | Generator tag |
|---|---|---|
| LangChain / LangGraph | `@wasmagent/langchain-agentbom` | `@wasmagent/langchain-agentbom` |
| LlamaIndex | `@wasmagent/llamaindex-agentbom` | `@wasmagent/llamaindex-agentbom` |
| AutoGen | `@wasmagent/autogen-agentbom` | `@wasmagent/autogen-agentbom` |

All adapters follow the same pattern: accept a plain config object describing the agent's tools, LLM, and metadata, and return an `AgentBOMRecord` that validates against `specs/agentbom/schema.json`.

The adapters do **not** import the framework packages themselves — they accept plain objects so users avoid version conflicts. Pass the relevant fields from your runtime agent instance.

---

## LangChain Integration

### Installation

```bash
npm install @wasmagent/langchain-agentbom
```

### Worked example

```typescript
import { generateAgentBOM } from '@wasmagent/langchain-agentbom';
import { validateAgentBOM } from '@wasmagent/agentbom-core';

// Extract from your LangChain agent at runtime
const agent = createReactAgent({ llm: chatModel, tools: [searchTool, codeTool] });

const bom = generateAgentBOM({
  agent_id: 'langchain-rag-agent',
  agent_name: 'RAG Research Agent',
  agent_version: '1.2.0',
  deployment_context: 'production',
  tools: agent.tools.map((t) => ({
    name: t.name,
    description: t.description,
    // Map LangChain tool types to AgentBOM sources
    source: isMCPTool(t) ? 'mcp' : 'builtin',
    mcp_server_id: isMCPTool(t) ? t.serverId : undefined,
    permissions: inferPermissions(t),
    risk_signals: inferRiskSignals(t),
  })),
  llm: {
    provider: 'anthropic',
    model_id: 'claude-sonnet-4-5',
    model_version: '2025-06',
    capabilities: ['tool_use', 'code_generation', 'analysis'],
  },
  system_prompt_hash: hashPrompt(agent.systemPrompt),
  granted_scopes: ['db:read', 'fs:read', 'network:outbound'],
  data_access: ['pinecone://index', 's3://docs'],
  credential_references: ['anthropic_api_key'],
});

// Validate against AgentBOM schema
const result = validateAgentBOM(bom);
console.assert(result.valid, `Invalid AgentBOM: ${result.errors.join(', ')}`);

// Export for downstream trust chain
import { writeFileSync } from 'node:fs';
writeFileSync('agentbom.json', JSON.stringify(bom, null, 2));
```

### Sample `tool_result` (generated AgentBOM JSON)

```json
{
  "agentbom_version": "0.1",
  "identity": {
    "agent_id": "langchain-rag-agent",
    "agent_name": "RAG Research Agent",
    "agent_version": "1.2.0",
    "deployment_context": "production",
    "generated_at": "2026-07-20T00:00:00.000Z"
  },
  "model_layer": {
    "provider": "anthropic",
    "model_id": "claude-sonnet-4-5",
    "model_version": "2025-06",
    "capabilities": ["tool_use", "code_generation", "analysis"]
  },
  "tool_layer": [
    {
      "tool_id": "web-search",
      "tool_name": "Search the web for current information",
      "source": "mcp",
      "mcp_server_id": "tavily-mcp",
      "permissions": ["network:outbound"],
      "risk_signals": ["ssrf"]
    },
    {
      "tool_id": "code-editor",
      "tool_name": "Edit code files in the workspace",
      "source": "plugin",
      "permissions": ["fs:read", "fs:write"],
      "risk_signals": []
    }
  ],
  "prompt_layer": {
    "system_prompt_hash": "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    "prompt_version": "v3.0"
  },
  "permission_layer": {
    "granted_scopes": ["db:read", "fs:read", "network:outbound"],
    "data_access": ["pinecone://index", "s3://docs"],
    "credential_references": ["anthropic_api_key"]
  },
  "attestation": {
    "generator": "@wasmagent/langchain-agentbom",
    "generator_version": "0.0.0-research"
  }
}
```

### LangChain `ToolConfig` reference

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Tool name (required). Slugified to `tool_id` if `id` not set. |
| `description` | `string?` | Human-readable description — maps to `tool_name`. |
| `id` | `string?` | Override for AgentBOM `tool_id`. |
| `source` | `"mcp" \| "builtin" \| "plugin"?` | Tool source (default: `"builtin"`). |
| `mcp_server_id` | `string?` | MCP server ID when source is `"mcp"`. |
| `skills` | `string[]?` | Skills contributed by this tool. |
| `permissions` | `string[]?` | Required permission scopes. |
| `risk_signals` | `string[]?` | Known risk signals. |

---

## LlamaIndex Integration

### Installation

```bash
npm install @wasmagent/llamaindex-agentbom
```

### Worked example

```typescript
import { generateAgentBOM } from '@wasmagent/llamaindex-agentbom';
import { validateAgentBOM } from '@wasmagent/agentbom-core';

// Extract from your LlamaIndex agent
const agent = new ReActAgent({
  llm: openaiLLM,
  tools: [queryEngineTool, wikipediaTool],
});

const bom = generateAgentBOM({
  agent_id: 'llamaindex-rag-agent',
  agent_name: 'LlamaIndex RAG Agent',
  agent_version: '0.8.0',
  deployment_context: 'production',
  tools: agent.tools.map((t) => ({
    name: t.metadata.name,
    description: t.metadata.description,
    source: 'builtin',
    permissions: ['db:read'],
  })),
  llm: {
    provider: 'openai',
    model_id: 'gpt-4o',
    capabilities: ['tool_use', 'reasoning'],
  },
  system_prompt_hash: hashPrompt(agent.systemPrompt),
  granted_scopes: ['db:read', 'network:outbound'],
  data_access: ['pinecone://vectors'],
});

const result = validateAgentBOM(bom);
console.assert(result.valid);
```

---

## AutoGen Integration

### Installation

```bash
npm install @wasmagent/autogen-agentbom
```

### Worked example

```typescript
import { generateAgentBOM } from '@wasmagent/autogen-agentbom';
import { validateAgentBOM } from '@wasmagent/agentbom-core';

// Map AutoGen agent definition to AgentBOM config
const bom = generateAgentBOM({
  agent_id: 'autogen-coder-agent',
  agent_name: 'AutoGen Coding Assistant',
  agent_version: '0.4.0',
  deployment_context: 'production',
  tools: [
    {
      name: 'execute_code',
      permissions: ['process:exec', 'fs:read', 'fs:write'],
      risk_signals: ['code_execution', 'filesystem_write'],
    },
    {
      name: 'web_search',
      permissions: ['network:outbound'],
      risk_signals: ['ssrf'],
    },
  ],
  llm: {
    provider: 'azure_openai',
    model_id: 'gpt-4o-2024-08-06',
    model_version: '2024-08',
    capabilities: ['function_calling', 'json_mode', 'code_generation'],
  },
  system_prompt_hash: hashPrompt(assistantAgent.systemMessage),
  granted_scopes: ['process:exec', 'fs:read', 'fs:write', 'network:outbound'],
  data_access: ['local_workspace', 'azure_storage'],
  credential_references: ['azure_openai_key'],
});

const result = validateAgentBOM(bom);
console.assert(result.valid);
```

---

## Downstream trust chain

Once you have an AgentBOM manifest, feed it into the rest of the trust chain:

```typescript
import { validateAgentBOM, inspectAgentBOM } from '@wasmagent/agentbom-core';

// Quick inspection
console.log(inspectAgentBOM(bom));
// → AgentBOM v0.1
//   Agent:   RAG Research Agent (langchain-rag-agent)
//   Context: production
//   Tools:   2
//   Risks:   0

// Full validation
const result = validateAgentBOM(bom);
if (!result.valid) {
  for (const err of result.errorDetails) {
    console.error(`${err.field}: ${err.message}`);
  }
}

// Use with the CLI
// $ agent-trust agentbom inspect agentbom.json
// $ agent-trust agentbom validate agentbom.json
// $ agent-trust chain --out ./trust-output/
```

## Publishing

These packages are designed for publication to npm under the `@wasmagent` scope. The `package.json` files are pre-configured with the correct name, `main` entry, and scripts. Publishing is tracked under the Phase 6 production hardening roadmap.

## Status

**Experimental research preview** — not production software. The adapter interfaces are stable but may evolve based on framework changes and community feedback.
