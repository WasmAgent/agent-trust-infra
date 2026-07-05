import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { validateAgentBOM } from "../../packages/agentbom-core/src/index.js";

interface GenerateOptions {
  agentPath: string;
  outputPath?: string;
}

interface ToolDefinition {
  tool_id: string;
  tool_name: string;
  source: "mcp" | "builtin" | "plugin";
  mcp_server_id?: string;
  permissions: string[];
  risk_signals: string[];
}

interface AgentInfo {
  agent_id: string;
  agent_name: string;
  agent_version?: string;
  deployment_context?: "development" | "staging" | "production";
}

interface ParsedGenerateArgs {
  agentPath: string;
  outputPath?: string;
}

const USAGE = "Usage: agent-trust generate bom --agent <path> [--out <path>]";

function parseGenerateArgs(args: string[]): ParsedGenerateArgs | null {
  let agentPath: string | undefined;
  let outputPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--agent") {
      agentPath = args[i + 1];
      i += 1;
    } else if (arg === "--out") {
      outputPath = args[i + 1];
      i += 1;
    } else {
      return null;
    }
  }

  if (!agentPath) return null;
  return { agentPath, outputPath };
}

/**
 * Extract basic agent information from package.json or directory name
 */
function extractAgentInfo(agentPath: string): AgentInfo {
  const pkgPath = resolve(agentPath, "package.json");
  let agentId = basename(agentPath).replace(/[^a-zA-Z0-9-]/g, "-");
  let agentName = agentId;
  let agentVersion: string | undefined;
  let deploymentContext: "development" | "staging" | "production" = "development";

  try {
    const pkgContent = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent);

    if (pkg.name) {
      agentName = pkg.name.replace(/^@[^/]+\//, "");
      agentId = agentName;
    }
    if (pkg.version) {
      agentVersion = pkg.version;
    }
  } catch {
    // No package.json or couldn't parse it, use directory name
  }

  // Generate a more specific agent_id
  const timestamp = Date.now();
  agentId = `${agentId}-${timestamp}`;

  return {
    agent_id: agentId,
    agent_name: agentName,
    agent_version: agentVersion,
    deployment_context: deploymentContext
  };
}

/**
 * Scan agent directory for MCP servers, plugins, and tools
 */
function scanAgentDirectory(agentPath: string): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  try {
    const entries = readdirSync(agentPath);

    // Look for MCP server definitions
    for (const entry of entries) {
      const fullPath = resolve(agentPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Check for MCP server patterns
        const mcpConfigPath = join(fullPath, "mcp.config.json");
        try {
          const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
          if (mcpConfig.tools && Array.isArray(mcpConfig.tools)) {
            for (const tool of mcpConfig.tools) {
              tools.push({
                tool_id: `mcp-${entry}-${tool.name}`,
                tool_name: tool.name,
                source: "mcp",
                mcp_server_id: entry,
                permissions: tool.permissions || [],
                risk_signals: []
              });
            }
          }
        } catch {
          // No MCP config here, continue
        }
      }
    }
  } catch {
    // Couldn't read directory
  }

  return tools;
}

/**
 * Generate standard tool inventory for a typical agent
 */
function generateStandardToolInventory(): ToolDefinition[] {
  return [
    {
      tool_id: "file-read",
      tool_name: "Read",
      source: "builtin",
      permissions: ["fs:read"],
      risk_signals: []
    },
    {
      tool_id: "file-write",
      tool_name: "Write",
      source: "builtin",
      permissions: ["fs:write"],
      risk_signals: []
    },
    {
      tool_id: "file-edit",
      tool_name: "Edit",
      source: "builtin",
      permissions: ["fs:read", "fs:write"],
      risk_signals: []
    },
    {
      tool_id: "bash-exec",
      tool_name: "Bash",
      source: "builtin",
      permissions: ["process:exec", "fs:read", "fs:write"],
      risk_signals: ["command_execution"]
    },
    {
      tool_id: "content-grep",
      tool_name: "Grep",
      source: "builtin",
      permissions: ["fs:read"],
      risk_signals: []
    },
    {
      tool_id: "file-glob",
      tool_name: "Glob",
      source: "builtin",
      permissions: ["fs:read"],
      risk_signals: []
    }
  ];
}

/**
 * Extract all unique permissions from tool inventory
 */
function extractPermissionScope(toolLayer: ToolDefinition[]): string[] {
  const permissionSet = new Set<string>();

  for (const tool of toolLayer) {
    for (const perm of tool.permissions) {
      permissionSet.add(perm);
    }
  }

  return Array.from(permissionSet).sort();
}

/**
 * Generate risk entries from tool risk signals
 */
function generateRiskEntries(toolLayer: ToolDefinition[]): Array<{
  risk_id: string;
  severity: string;
  category: string;
  description: string;
  status: string;
}> {
  const risks: Array<{
    risk_id: string;
    severity: string;
    category: string;
    description: string;
    status: string;
  }> = [];

  const categoryMap: Record<string, { severity: string; category: string; description: string }> = {
    "command_execution": {
      severity: "high",
      category: "command_execution",
      description: "Tool allows execution of arbitrary commands"
    },
    "file_access": {
      severity: "medium",
      category: "ssrf",
      description: "Tool can access files on the filesystem"
    }
  };

  for (const tool of toolLayer) {
    for (const signal of tool.risk_signals) {
      const mapping = categoryMap[signal];
      if (mapping) {
        risks.push({
          risk_id: `risk-${tool.tool_id}-${signal}`,
          severity: mapping.severity,
          category: mapping.category,
          description: mapping.description,
          status: "open"
        });
      }
    }
  }

  return risks;
}

export function generateAgentBOMCommand(args: string[]): number {
  const parsed = parseGenerateArgs(args);
  if (!parsed) {
    console.error(USAGE);
    return 1;
  }

  const { agentPath, outputPath } = parsed;

  // Validate agent path exists
  if (!existsSync(agentPath)) {
    console.error(`Error: agent path does not exist: ${agentPath}`);
    return 1;
  }

  // Extract agent information
  const agentInfo = extractAgentInfo(agentPath);

  // Scan for tools
  const scannedTools = scanAgentDirectory(agentPath);
  const standardTools = generateStandardToolInventory();
  const toolLayer = [...standardTools, ...scannedTools];

  // Generate permission scope
  const permissionScope = extractPermissionScope(toolLayer);

  // Generate risk entries
  const riskLayer = generateRiskEntries(toolLayer);

  // Build AgentBOM
  const agentBOM = {
    agentbom_version: "0.1",
    identity: {
      agent_id: agentInfo.agent_id,
      agent_name: agentInfo.agent_name,
      agent_version: agentInfo.agent_version,
      deployment_context: agentInfo.deployment_context,
      generated_at: new Date().toISOString()
    },
    attestation: {
      generator: "agent-trust-cli",
      generator_version: "0.0.1-research"
    },
    tool_layer: toolLayer,
    permission_layer: {
      granted_scopes: permissionScope,
      data_access: ["local_workspace"],
      credential_references: []
    },
    risk_layer: riskLayer
  };

  // Validate the generated AgentBOM
  const validationResult = validateAgentBOM(agentBOM);
  if (!validationResult.valid) {
    console.error("Error: generated AgentBOM is not valid:");
    for (const error of validationResult.errors) {
      console.error(`  ${error}`);
    }
    return 1;
  }

  // Write output
  const outputPathResolved = outputPath || resolve(agentPath, "agentbom.json");
  try {
    writeFileSync(outputPathResolved, JSON.stringify(agentBOM, null, 2));
    console.log(`AgentBOM generated successfully: ${outputPathResolved}`);
    console.log(`  Agent: ${agentInfo.agent_name} (${agentInfo.agent_id})`);
    console.log(`  Tools: ${toolLayer.length}`);
    console.log(`  Permissions: ${permissionScope.length}`);
    console.log(`  Risks: ${riskLayer.length}`);
  } catch (err) {
    console.error(`Error: failed to write AgentBOM to ${outputPathResolved}`);
    if (err instanceof Error) {
      console.error(`  ${err.message}`);
    }
    return 1;
  }

  return 0;
}
