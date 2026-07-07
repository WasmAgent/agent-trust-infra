/**
 * Trust Runtime Enforcement
 *
 * This module provides both AgentBOM runtime validation and MCP server decorator
 * functionality for enforcing trust policies at runtime.
 */

import { validateAgentBOM as validateAgentBOMCore } from "@wasmagent/agentbom-core";
import { validateMCPPosture } from "@wasmagent/mcp-posture-core";

// ============================================================================
// AgentBOM Runtime Validation
// ============================================================================

export interface ToolInvocation {
  tool_id: string;
  tool_name: string;
  permissions?: string[];
}

export interface PermissionRequest {
  scope: string;
}

export interface RuntimeRequest {
  tool_invocations: ToolInvocation[];
  permission_requests: PermissionRequest[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  errorDetails: ValidationError[];
}

export interface ValidationError {
  type: "unknown_tool" | "undeclared_permission" | "invalid_agentbom";
  message: string;
  tool_id?: string;
  permission?: string;
}

export interface RuntimeValidator {
  /**
   * Validates a tool invocation against the AgentBOM tool_layer.
   * Returns an error if the tool is not declared or requires undeclared permissions.
   */
  validateToolInvocation(invocation: ToolInvocation): ValidationResult;

  /**
   * Validates a permission scope against the AgentBOM permission_layer.
   * Returns an error if the permission scope is not granted.
   */
  validatePermissionScope(request: PermissionRequest): ValidationResult;

  /**
   * Validates a complete runtime request (multiple tools + permissions).
   * Returns all validation errors found.
   */
  validateRuntimeRequest(request: RuntimeRequest): ValidationResult;
}

class RuntimeValidatorImpl implements RuntimeValidator {
  private declaredTools: Map<string, { permissions: Set<string> }>;
  private grantedScopes: Set<string>;

  constructor(private agentBOM: Record<string, unknown>) {
    // Parse tool_layer
    this.declaredTools = new Map();
    const toolLayer = (agentBOM.tool_layer as unknown[]) ?? [];
    for (const item of toolLayer) {
      if (typeof item === "object" && item !== null) {
        const t = item as Record<string, unknown>;
        if (typeof t.tool_id === "string") {
          const perms = new Set(
            Array.isArray(t.permissions) ? t.permissions.map(String) : []
          );
          this.declaredTools.set(t.tool_id, { permissions: perms });
        }
      }
    }

    // Parse permission_layer
    this.grantedScopes = new Set();
    const permLayer = agentBOM.permission_layer as
      | Record<string, unknown>
      | undefined;
    const scopes = (
      permLayer?.granted_scopes as unknown[]
    ) ?? [];
    for (const scope of scopes) {
      if (typeof scope === "string") {
        this.grantedScopes.add(scope);
      }
    }
  }

  validateToolInvocation(invocation: ToolInvocation): ValidationResult {
    const errors: ValidationError[] = [];

    // Check if tool is declared
    const declaredTool = this.declaredTools.get(invocation.tool_id);
    if (!declaredTool) {
      errors.push({
        type: "unknown_tool",
        message: `Tool '${invocation.tool_name}' (${invocation.tool_id}) is not declared in AgentBOM tool_layer`,
        tool_id: invocation.tool_id,
      });
      return {
        valid: false,
        errors: errors.map((e) => e.message),
        errorDetails: errors,
      };
    }

    // Check if requested permissions exceed tool's declared permissions
    const requestedPerms = new Set(invocation.permissions ?? []);
    for (const perm of requestedPerms) {
      if (!declaredTool.permissions.has(perm)) {
        errors.push({
          type: "undeclared_permission",
          message: `Tool '${invocation.tool_name}' requested permission '${perm}' which exceeds its declared permissions in AgentBOM`,
          tool_id: invocation.tool_id,
          permission: perm,
        });
      }
    }

    // Check if tool's declared permissions are granted
    const requiredPerms = declaredTool.permissions;
    if (requiredPerms.size > 0) {
      for (const perm of requiredPerms) {
        if (!this.grantedScopes.has(perm)) {
          errors.push({
            type: "undeclared_permission",
            message: `Tool '${invocation.tool_name}' requires permission '${perm}' (from AgentBOM) which is not in granted_scopes`,
            tool_id: invocation.tool_id,
            permission: perm,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.map((e) => e.message),
      errorDetails: errors,
    };
  }

  validatePermissionScope(request: PermissionRequest): ValidationResult {
    const errors: ValidationError[] = [];

    if (!this.grantedScopes.has(request.scope)) {
      errors.push({
        type: "undeclared_permission",
        message: `Permission scope '${request.scope}' is not in granted_scopes`,
        permission: request.scope,
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.map((e) => e.message),
      errorDetails: errors,
    };
  }

  validateRuntimeRequest(request: RuntimeRequest): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate each tool invocation
    for (const invocation of request.tool_invocations) {
      const result = this.validateToolInvocation(invocation);
      errors.push(...result.errorDetails);
    }

    // Validate each permission request
    for (const permRequest of request.permission_requests) {
      const result = this.validatePermissionScope(permRequest);
      errors.push(...result.errorDetails);
    }

    return {
      valid: errors.length === 0,
      errors: errors.map((e) => e.message),
      errorDetails: errors,
    };
  }
}

/**
 * Creates a runtime validator from an AgentBOM.
 * First validates the AgentBOM itself, then returns a validator if valid.
 */
export function createRuntimeValidator(
  agentBOM: Record<string, unknown>
): RuntimeValidator | null {
  const bomValidation = validateAgentBOMCore(agentBOM);
  if (!bomValidation.valid) {
    // AgentBOM is invalid - cannot create validator
    return null;
  }

  return new RuntimeValidatorImpl(agentBOM);
}

// ============================================================================
// MCP Server Decorator for Posture Enforcement
// ============================================================================

/**
 * Represents an MCP server with its tools and metadata
 */
export interface MCPServer {
  server_id: string;
  server_name: string;
  version?: string;
  provenance?: "verified" | "unverified" | "unknown";
  tools: MCPTool[];
}

/**
 * Represents an MCP tool with permissions and risk classification
 */
export interface MCPTool {
  tool_id: string;
  tool_name: string;
  permissions?: string[];
  risk_categories?: RiskCategory[];
  risk_severity?: "critical" | "high" | "medium" | "low" | "info";
}

/**
 * Risk categories from the MCP posture taxonomy
 */
export type RiskCategory =
  | "ssrf"
  | "exfiltration"
  | "command_execution"
  | "privilege_escalation"
  | "prompt_injection"
  | "credential_access"
  | "supply_chain";

/**
 * Configuration for posture enforcement
 */
export interface PostureEnforcementConfig {
  /** Maximum allowed risk severity (tools above this level are blocked) */
  maxRiskSeverity?: "critical" | "high" | "medium" | "low" | "info";
  /** Risk categories that are explicitly blocked */
  blockedCategories?: RiskCategory[];
  /** Required provenance level for servers */
  requiredProvenance?: "verified" | "unverified" | "unknown";
  /** Whether to allow unverified servers */
  allowUnverified?: boolean;
  /** Custom tool filter function */
  toolFilter?: (tool: MCPTool) => boolean;
}

/**
 * Result of a tool call enforcement check
 */
export interface EnforcementResult {
  allowed: boolean;
  reason?: string;
  toolId?: string;
  serverId?: string;
}

/**
 * MCP Server Decorator
 *
 * Wraps an MCP server with posture enforcement based on declared capabilities.
 * The decorator intercepts tool access and enforces constraints before allowing execution.
 */
export class MCPServerDecorator {
  private server: MCPServer;
  private config: PostureEnforcementConfig;

  constructor(server: MCPServer, config: PostureEnforcementConfig = {}) {
    this.server = server;
    this.config = {
      allowUnverified: true,
      ...config,
    };
  }

  /**
   * Check if a tool call is allowed based on posture enforcement rules
   */
  enforceToolAccess(toolId: string): EnforcementResult {
    const tool = this.server.tools.find((t) => t.tool_id === toolId);

    if (!tool) {
      return {
        allowed: false,
        reason: `Tool ${toolId} not found in server ${this.server.server_id}`,
        toolId,
        serverId: this.server.server_id,
      };
    }

    // Check if unverified servers are blocked
    if (this.server.provenance === "unverified" && !this.config.allowUnverified) {
      return {
        allowed: false,
        reason: `Server ${this.server.server_id} has unverified provenance and allowUnverified is false`,
        toolId,
        serverId: this.server.server_id,
      };
    }

    // Check provenance
    if (
      this.config.requiredProvenance &&
      this.server.provenance !== this.config.requiredProvenance
    ) {
      if (!this.config.allowUnverified || this.server.provenance === "unverified") {
        return {
          allowed: false,
          reason: `Server ${this.server.server_id} does not meet required provenance ${this.config.requiredProvenance}`,
          toolId,
          serverId: this.server.server_id,
        };
      }
    }

    // Check risk severity
    if (this.config.maxRiskSeverity && tool.risk_severity) {
      const severityLevels = ["critical", "high", "medium", "low", "info"];
      const toolLevel = severityLevels.indexOf(tool.risk_severity);
      const maxLevel = severityLevels.indexOf(this.config.maxRiskSeverity);

      if (toolLevel < maxLevel) {
        // Lower index = higher severity
        return {
          allowed: false,
          reason: `Tool ${toolId} has risk severity ${tool.risk_severity}, which exceeds maximum allowed ${this.config.maxRiskSeverity}`,
          toolId,
          serverId: this.server.server_id,
        };
      }
    }

    // Check blocked categories
    if (this.config.blockedCategories && tool.risk_categories) {
      for (const category of tool.risk_categories) {
        if (this.config.blockedCategories.includes(category)) {
          return {
            allowed: false,
            reason: `Tool ${toolId} has blocked risk category ${category}`,
            toolId,
            serverId: this.server.server_id,
          };
        }
      }
    }

    // Apply custom filter
    if (this.config.toolFilter && !this.config.toolFilter(tool)) {
      return {
        allowed: false,
        reason: `Tool ${toolId} was rejected by custom filter`,
        toolId,
        serverId: this.server.server_id,
      };
    }

    return {
      allowed: true,
      toolId,
      serverId: this.server.server_id,
    };
  }

  /**
   * Get all tools that pass the posture enforcement rules
   */
  getAllowedTools(): MCPTool[] {
    return this.server.tools.filter((tool) => {
      const result = this.enforceToolAccess(tool.tool_id);
      return result.allowed;
    });
  }

  /**
   * Get the original (undecorated) server
   */
  getUndecoratedServer(): MCPServer {
    return this.server;
  }

  /**
   * Get the enforcement configuration
   */
  getConfig(): PostureEnforcementConfig {
    return { ...this.config };
  }
}

/**
 * Decorator factory that creates an MCPServerDecorator from server posture data
 *
 * @param serverData - Raw server data from a posture declaration
 * @param config - Enforcement configuration
 * @returns A decorated server with posture enforcement
 */
export function createDecoratedServer(
  serverData: MCPServer,
  config: PostureEnforcementConfig = {}
): MCPServerDecorator {
  return new MCPServerDecorator(serverData, config);
}

/**
 * Validate and decorate a server from posture data
 *
 * @param postureData - Full posture data object
 * @param serverId - ID of the server to decorate
 * @param config - Enforcement configuration
 * @returns A decorated server if found and valid
 * @throws Error if posture is invalid or server not found
 */
export function decorateServerFromPosture(
  postureData: unknown,
  serverId: string,
  config: PostureEnforcementConfig = {}
): MCPServerDecorator {
  // Validate the posture data
  const validation = validateMCPPosture(postureData);
  if (!validation.valid) {
    throw new Error(
      `Invalid posture data: ${validation.errors.join(", ")}`
    );
  }

  // Extract server data
  const posture = postureData as {
    servers: MCPServer[];
  };

  const server = posture.servers.find((s) => s.server_id === serverId);
  if (!server) {
    throw new Error(`Server ${serverId} not found in posture data`);
  }

  return new MCPServerDecorator(server, config);
}

/**
 * Enforce posture across multiple servers
 *
 * @param servers - Array of servers to enforce
 * @param config - Enforcement configuration
 * @returns Array of decorated servers
 */
export function enforcePostureOnServers(
  servers: MCPServer[],
  config: PostureEnforcementConfig = {}
): MCPServerDecorator[] {
  return servers.map((server) => new MCPServerDecorator(server, config));
}

/**
 * Check if a specific tool invocation would be allowed across all servers
 *
 * @param decorators - Array of decorated servers
 * @param toolId - Tool ID to check
 * @returns Object showing which servers allow the tool
 */
export function checkToolAccessAcrossServers(
  decorators: MCPServerDecorator[],
  toolId: string
): {
  allowed: boolean;
  results: EnforcementResult[];
} {
  const results = decorators.map((decorator) =>
    decorator.enforceToolAccess(toolId)
  );

  const allowed = results.some((r) => r.allowed);

  return { allowed, results };
}

/**
 * Summarize enforcement state across all decorated servers
 *
 * @param decorators - Array of decorated servers
 * @returns Human-readable summary
 */
export function summarizeEnforcementState(decorators: MCPServerDecorator[]): string {
  const lines: string[] = [];

  for (const decorator of decorators) {
    const server = decorator.getUndecoratedServer();
    const allowedTools = decorator.getAllowedTools();
    const blockedTools = server.tools.length - allowedTools.length;

    lines.push(`Server: ${server.server_name} (${server.server_id})`);
    lines.push(`  Total tools: ${server.tools.length}`);
    lines.push(`  Allowed: ${allowedTools.length}`);
    lines.push(`  Blocked: ${blockedTools}`);

    if (blockedTools > 0) {
      const blockedList = server.tools.filter((t) => {
        const result = decorator.enforceToolAccess(t.tool_id);
        return !result.allowed;
      });

      lines.push("  Blocked tools:");
      for (const tool of blockedList) {
        const result = decorator.enforceToolAccess(tool.tool_id);
        lines.push(`    - ${tool.tool_name}: ${result.reason}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// Re-exports
// ============================================================================

/**
 * Validates an AgentBOM and returns detailed validation results.
 * Re-exported from @wasmagent/agentbom-core for convenience.
 */
export { validateAgentBOM } from "@wasmagent/agentbom-core";
