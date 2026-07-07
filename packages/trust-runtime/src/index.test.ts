import { describe, it, expect, beforeEach } from "bun:test";
import {
  MCPServerDecorator,
  createDecoratedServer,
  decorateServerFromPosture,
  enforcePostureOnServers,
  checkToolAccessAcrossServers,
  summarizeEnforcementState,
  createRuntimeValidator,
  validateAgentBOM,
  type MCPServer,
  type MCPTool,
  type PostureEnforcementConfig,
  type RiskCategory,
  type RuntimeValidator,
  type ToolInvocation,
  type PermissionRequest,
  type RuntimeRequest,
} from "./index";

describe("MCPServerDecorator", () => {
  const mockServer: MCPServer = {
    server_id: "test-server-1",
    server_name: "Test Server",
    provenance: "verified",
    tools: [
      {
        tool_id: "safe-tool",
        tool_name: "safe_tool",
        permissions: ["read"],
        risk_severity: "low",
        risk_categories: [],
      },
      {
        tool_id: "risky-tool",
        tool_name: "risky_tool",
        permissions: ["read", "write"],
        risk_severity: "high",
        risk_categories: ["ssrf"],
      },
      {
        tool_id: "critical-tool",
        tool_name: "critical_tool",
        permissions: ["execute"],
        risk_severity: "critical",
        risk_categories: ["command_execution"],
      },
    ],
  };

  describe("constructor and basic operations", () => {
    it("creates a decorator with default config", () => {
      const decorator = new MCPServerDecorator(mockServer);
      expect(decorator).toBeDefined();
      expect(decorator.getUndecoratedServer()).toEqual(mockServer);
    });

    it("creates a decorator with custom config", () => {
      const config: PostureEnforcementConfig = {
        maxRiskSeverity: "medium",
        allowUnverified: false,
      };
      const decorator = new MCPServerDecorator(mockServer, config);
      expect(decorator.getConfig()).toEqual({
        maxRiskSeverity: "medium",
        allowUnverified: false,
      });
    });

    it("merges default config with custom config", () => {
      const config: PostureEnforcementConfig = {
        maxRiskSeverity: "high",
      };
      const decorator = new MCPServerDecorator(mockServer, config);
      const retrievedConfig = decorator.getConfig();
      expect(retrievedConfig.maxRiskSeverity).toBe("high");
      expect(retrievedConfig.allowUnverified).toBe(true); // default value
    });
  });

  describe("enforceToolAccess", () => {
    it("allows access to tools when no restrictions are set", () => {
      const decorator = new MCPServerDecorator(mockServer);
      const result = decorator.enforceToolAccess("safe-tool");
      expect(result.allowed).toBe(true);
      expect(result.toolId).toBe("safe-tool");
      expect(result.serverId).toBe("test-server-1");
    });

    it("blocks access to non-existent tools", () => {
      const decorator = new MCPServerDecorator(mockServer);
      const result = decorator.enforceToolAccess("non-existent-tool");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not found");
    });

    describe("risk severity enforcement", () => {
      it("blocks tools exceeding max risk severity", () => {
        const decorator = new MCPServerDecorator(mockServer, {
          maxRiskSeverity: "low",
        });
        const result = decorator.enforceToolAccess("risky-tool");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("exceeds maximum allowed");
      });

      it("allows tools within max risk severity", () => {
        const decorator = new MCPServerDecorator(mockServer, {
          maxRiskSeverity: "high",
        });
        const result = decorator.enforceToolAccess("risky-tool");
        expect(result.allowed).toBe(true);
      });

      it("allows all tools when max severity is critical", () => {
        const decorator = new MCPServerDecorator(mockServer, {
          maxRiskSeverity: "critical",
        });
        expect(decorator.enforceToolAccess("safe-tool").allowed).toBe(true);
        expect(decorator.enforceToolAccess("risky-tool").allowed).toBe(true);
        expect(decorator.enforceToolAccess("critical-tool").allowed).toBe(true);
      });

      it("blocks high and critical when max is medium", () => {
        const decorator = new MCPServerDecorator(mockServer, {
          maxRiskSeverity: "medium",
        });
        expect(decorator.enforceToolAccess("safe-tool").allowed).toBe(true);
        expect(decorator.enforceToolAccess("risky-tool").allowed).toBe(false);
        expect(decorator.enforceToolAccess("critical-tool").allowed).toBe(false);
      });
    });

    describe("risk category enforcement", () => {
      it("blocks tools with blocked risk categories", () => {
        const decorator = new MCPServerDecorator(mockServer, {
          blockedCategories: ["ssrf"],
        });
        const result = decorator.enforceToolAccess("risky-tool");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("blocked risk category");
      });

      it("allows tools with non-blocked categories", () => {
        const decorator = new MCPServerDecorator(mockServer, {
          blockedCategories: ["exfiltration"],
        });
        const result = decorator.enforceToolAccess("risky-tool");
        expect(result.allowed).toBe(true);
      });

      it("blocks tools with multiple blocked categories", () => {
        const serverWithMultipleCats: MCPServer = {
          ...mockServer,
          tools: [
            {
              tool_id: "multi-risk-tool",
              tool_name: "multi_risk_tool",
              risk_categories: ["ssrf", "exfiltration"],
            },
          ],
        };
        const decorator = new MCPServerDecorator(serverWithMultipleCats, {
          blockedCategories: ["ssrf"],
        });
        const result = decorator.enforceToolAccess("multi-risk-tool");
        expect(result.allowed).toBe(false);
      });
    });

    describe("provenance enforcement", () => {
      it("blocks unverified servers when allowUnverified is false", () => {
        const unverifiedServer: MCPServer = {
          ...mockServer,
          provenance: "unverified",
        };
        const decorator = new MCPServerDecorator(unverifiedServer, {
          allowUnverified: false,
        });
        const result = decorator.enforceToolAccess("safe-tool");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("provenance");
      });

      it("allows unverified servers when allowUnverified is true", () => {
        const unverifiedServer: MCPServer = {
          ...mockServer,
          provenance: "unverified",
        };
        const decorator = new MCPServerDecorator(unverifiedServer, {
          allowUnverified: true,
        });
        const result = decorator.enforceToolAccess("safe-tool");
        expect(result.allowed).toBe(true);
      });

      it("enforces required provenance level", () => {
        const decorator = new MCPServerDecorator(mockServer, {
          requiredProvenance: "verified",
        });
        const result = decorator.enforceToolAccess("safe-tool");
        expect(result.allowed).toBe(true);
      });

      it("blocks when required provenance is not met", () => {
        const unverifiedServer: MCPServer = {
          ...mockServer,
          provenance: "unverified",
        };
        const decorator = new MCPServerDecorator(unverifiedServer, {
          requiredProvenance: "verified",
          allowUnverified: false,
        });
        const result = decorator.enforceToolAccess("safe-tool");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("provenance");
      });
    });

    describe("custom filter enforcement", () => {
      it("applies custom filter function", () => {
        const decorator = new MCPServerDecorator(mockServer, {
          toolFilter: (tool) => tool.tool_id.startsWith("safe"),
        });
        expect(decorator.enforceToolAccess("safe-tool").allowed).toBe(true);
        expect(decorator.enforceToolAccess("risky-tool").allowed).toBe(false);
        expect(decorator.enforceToolAccess("critical-tool").allowed).toBe(false);
      });

      it("combines custom filter with other restrictions", () => {
        const decorator = new MCPServerDecorator(mockServer, {
          toolFilter: (tool) => tool.tool_id.startsWith("safe"),
          maxRiskSeverity: "medium",
        });
        expect(decorator.enforceToolAccess("safe-tool").allowed).toBe(true);
        expect(decorator.enforceToolAccess("risky-tool").allowed).toBe(false);
      });
    });
  });

  describe("getAllowedTools", () => {
    it("returns all tools when no restrictions are set", () => {
      const decorator = new MCPServerDecorator(mockServer);
      const allowed = decorator.getAllowedTools();
      expect(allowed).toHaveLength(3);
    });

    it("filters tools based on risk severity", () => {
      const decorator = new MCPServerDecorator(mockServer, {
        maxRiskSeverity: "low",
      });
      const allowed = decorator.getAllowedTools();
      expect(allowed).toHaveLength(1);
      expect(allowed[0].tool_id).toBe("safe-tool");
    });

    it("filters tools based on risk categories", () => {
      const decorator = new MCPServerDecorator(mockServer, {
        blockedCategories: ["ssrf"],
      });
      const allowed = decorator.getAllowedTools();
      expect(allowed).toHaveLength(2);
      expect(allowed.every((t) => t.tool_id !== "risky-tool")).toBe(true);
    });

    it("filters tools based on custom filter", () => {
      const decorator = new MCPServerDecorator(mockServer, {
        toolFilter: (tool) => !tool.tool_id.includes("risky"),
      });
      const allowed = decorator.getAllowedTools();
      expect(allowed).toHaveLength(2);
      expect(allowed.every((t) => !t.tool_id.includes("risky"))).toBe(true);
    });
  });
});

describe("createDecoratedServer", () => {
  it("creates a decorator from server data", () => {
    const server: MCPServer = {
      server_id: "server-1",
      server_name: "Server 1",
      tools: [{ tool_id: "tool-1", tool_name: "tool_1" }],
    };
    const decorator = createDecoratedServer(server);
    expect(decorator).toBeInstanceOf(MCPServerDecorator);
    expect(decorator.getUndecoratedServer()).toEqual(server);
  });

  it("applies provided configuration", () => {
    const server: MCPServer = {
      server_id: "server-1",
      server_name: "Server 1",
      tools: [{ tool_id: "tool-1", tool_name: "tool_1" }],
    };
    const decorator = createDecoratedServer(server, {
      maxRiskSeverity: "low",
    });
    expect(decorator.getConfig().maxRiskSeverity).toBe("low");
  });
});

describe("decorateServerFromPosture", () => {
  const validPosture = {
    posture_version: "0.1",
    identity: {
      snapshot_id: "test-snapshot",
      agent_id: "test-agent",
      captured_at: "2026-07-07T00:00:00Z",
    },
    servers: [
      {
        server_id: "server-1",
        server_name: "Server 1",
        tools: [{ tool_id: "tool-1", tool_name: "tool_1" }],
      },
      {
        server_id: "server-2",
        server_name: "Server 2",
        tools: [
          {
            tool_id: "risky-tool",
            tool_name: "risky_tool",
            risk_severity: "high",
            risk_categories: ["ssrf"],
          },
        ],
      },
    ],
    attestation: { generator: "test" },
  };

  it("creates decorator from valid posture data", () => {
    const decorator = decorateServerFromPosture(validPosture, "server-1");
    expect(decorator).toBeInstanceOf(MCPServerDecorator);
    expect(decorator.getUndecoratedServer().server_id).toBe("server-1");
  });

  it("throws error for invalid posture data", () => {
    const invalidPosture = { invalid: "data" };
    expect(() =>
      decorateServerFromPosture(invalidPosture, "server-1")
    ).toThrow("Invalid posture data");
  });

  it("throws error when server not found", () => {
    expect(() =>
      decorateServerFromPosture(validPosture, "non-existent-server")
    ).toThrow("Server non-existent-server not found");
  });

  it("applies enforcement config to decorated server", () => {
    const decorator = decorateServerFromPosture(validPosture, "server-2", {
      maxRiskSeverity: "medium",
    });
    const result = decorator.enforceToolAccess("risky-tool");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("exceeds maximum allowed");
  });
});

describe("enforcePostureOnServers", () => {
  it("creates decorators for all servers", () => {
    const servers: MCPServer[] = [
      {
        server_id: "server-1",
        server_name: "Server 1",
        tools: [{ tool_id: "tool-1", tool_name: "tool_1" }],
      },
      {
        server_id: "server-2",
        server_name: "Server 2",
        tools: [{ tool_id: "tool-2", tool_name: "tool_2" }],
      },
    ];
    const decorators = enforcePostureOnServers(servers);
    expect(decorators).toHaveLength(2);
    expect(decorators[0]).toBeInstanceOf(MCPServerDecorator);
    expect(decorators[1]).toBeInstanceOf(MCPServerDecorator);
  });

  it("applies same config to all decorators", () => {
    const servers: MCPServer[] = [
      {
        server_id: "server-1",
        server_name: "Server 1",
        tools: [
          {
            tool_id: "tool-1",
            tool_name: "tool_1",
            risk_severity: "high",
          },
        ],
      },
      {
        server_id: "server-2",
        server_name: "Server 2",
        tools: [
          {
            tool_id: "tool-2",
            tool_name: "tool_2",
            risk_severity: "high",
          },
        ],
      },
    ];
    const decorators = enforcePostureOnServers(servers, {
      maxRiskSeverity: "medium",
    });
    expect(decorators[0].enforceToolAccess("tool-1").allowed).toBe(false);
    expect(decorators[1].enforceToolAccess("tool-2").allowed).toBe(false);
  });
});

describe("checkToolAccessAcrossServers", () => {
  it("returns results for all servers", () => {
    const servers: MCPServer[] = [
      {
        server_id: "server-1",
        server_name: "Server 1",
        tools: [
          {
            tool_id: "shared-tool",
            tool_name: "shared_tool",
            risk_severity: "low",
          },
        ],
      },
      {
        server_id: "server-2",
        server_name: "Server 2",
        tools: [
          {
            tool_id: "shared-tool",
            tool_name: "shared_tool",
            risk_severity: "low",
          },
        ],
      },
    ];
    const decorators = enforcePostureOnServers(servers);
    const result = checkToolAccessAcrossServers(decorators, "shared-tool");

    expect(result.results).toHaveLength(2);
    expect(result.allowed).toBe(true);
    expect(result.results[0].allowed).toBe(true);
    expect(result.results[1].allowed).toBe(true);
  });

  it("indicates if tool is allowed on any server", () => {
    const servers: MCPServer[] = [
      {
        server_id: "server-1",
        server_name: "Server 1",
        tools: [
          {
            tool_id: "tool-1",
            tool_name: "tool_1",
            risk_severity: "low",
          },
        ],
      },
      {
        server_id: "server-2",
        server_name: "Server 2",
        tools: [
          {
            tool_id: "tool-1",
            tool_name: "tool_1",
            risk_severity: "high",
          },
        ],
      },
    ];
    const decorators = enforcePostureOnServers(servers, {
      maxRiskSeverity: "medium",
    });
    const result = checkToolAccessAcrossServers(decorators, "tool-1");

    expect(result.allowed).toBe(true); // allowed on server-1
    expect(result.results[0].allowed).toBe(true);
    expect(result.results[1].allowed).toBe(false);
  });
});

describe("summarizeEnforcementState", () => {
  it("produces human-readable summary", () => {
    const servers: MCPServer[] = [
      {
        server_id: "server-1",
        server_name: "Server 1",
        tools: [
          {
            tool_id: "tool-1",
            tool_name: "tool_1",
            risk_severity: "low",
          },
          {
            tool_id: "risky-tool",
            tool_name: "risky_tool",
            risk_severity: "high",
          },
        ],
      },
    ];
    const decorators = enforcePostureOnServers(servers, {
      maxRiskSeverity: "medium",
    });
    const summary = summarizeEnforcementState(decorators);

    expect(summary).toContain("Server: Server 1");
    expect(summary).toContain("Total tools: 2");
    expect(summary).toContain("Allowed: 1");
    expect(summary).toContain("Blocked: 1");
    expect(summary).toContain("risky_tool");
  });

  it("shows multiple servers", () => {
    const servers: MCPServer[] = [
      {
        server_id: "server-1",
        server_name: "Server 1",
        tools: [{ tool_id: "tool-1", tool_name: "tool_1" }],
      },
      {
        server_id: "server-2",
        server_name: "Server 2",
        tools: [{ tool_id: "tool-2", tool_name: "tool_2" }],
      },
    ];
    const decorators = enforcePostureOnServers(servers);
    const summary = summarizeEnforcementState(decorators);

    expect(summary).toContain("Server: Server 1");
    expect(summary).toContain("Server: Server 2");
  });

  it("shows no blocked tools when all allowed", () => {
    const servers: MCPServer[] = [
      {
        server_id: "server-1",
        server_name: "Server 1",
        tools: [
          {
            tool_id: "tool-1",
            tool_name: "tool_1",
            risk_severity: "low",
          },
        ],
      },
    ];
    const decorators = enforcePostureOnServers(servers, {
      maxRiskSeverity: "critical",
    });
    const summary = summarizeEnforcementState(decorators);

    expect(summary).toContain("Allowed: 1");
    expect(summary).toContain("Blocked: 0");
    expect(summary).not.toContain("Blocked tools:");
  });
});

describe("Integration scenarios", () => {
  it("handles complex multi-server posture enforcement", () => {
    const posture = {
      posture_version: "0.1" as const,
      identity: {
        snapshot_id: "integration-test",
        agent_id: "agent-001",
        captured_at: "2026-07-07T00:00:00Z",
      },
      servers: [
        {
          server_id: "file-server",
          server_name: "File Operations",
          provenance: "verified" as const,
          tools: [
            {
              tool_id: "read-file",
              tool_name: "read_file",
              risk_severity: "low" as const,
              risk_categories: [] as RiskCategory[],
            },
            {
              tool_id: "write-file",
              tool_name: "write_file",
              risk_severity: "medium" as const,
              risk_categories: ["exfiltration"] as RiskCategory[],
            },
          ],
        },
        {
          server_id: "network-server",
          server_name: "Network Operations",
          provenance: "unverified" as const,
          tools: [
            {
              tool_id: "fetch-url",
              tool_name: "fetch_url",
              risk_severity: "high" as const,
              risk_categories: ["ssrf"] as RiskCategory[],
            },
          ],
        },
        {
          server_id: "exec-server",
          server_name: "Command Execution",
          provenance: "verified" as const,
          tools: [
            {
              tool_id: "run-command",
              tool_name: "run_command",
              risk_severity: "critical" as const,
              risk_categories: ["command_execution"] as RiskCategory[],
            },
          ],
        },
      ],
      attestation: { generator: "integration-test" },
    };

    // Create decorators with restrictive config
    const decorators = enforcePostureOnServers(posture.servers, {
      maxRiskSeverity: "medium",
      allowUnverified: false,
      blockedCategories: ["ssrf"],
    });

    // Check enforcement state
    const summary = summarizeEnforcementState(decorators);
    expect(summary).toContain("Server: File Operations");
    expect(summary).toContain("Server: Network Operations");
    expect(summary).toContain("Server: Command Execution");

    // Verify specific tool access
    const fileServer = decorators[0];
    expect(fileServer.enforceToolAccess("read-file").allowed).toBe(true);
    expect(fileServer.enforceToolAccess("write-file").allowed).toBe(true);

    const networkServer = decorators[1];
    expect(networkServer.enforceToolAccess("fetch-url").allowed).toBe(false);

    const execServer = decorators[2];
    expect(execServer.enforceToolAccess("run-command").allowed).toBe(false);

    // Check cross-server tool access
    const fileCheck = checkToolAccessAcrossServers(decorators, "read-file");
    expect(fileCheck.allowed).toBe(true);
    expect(fileCheck.results[0].allowed).toBe(true);

    const execCheck = checkToolAccessAcrossServers(decorators, "run-command");
    expect(execCheck.allowed).toBe(false);
  });
});

describe("AgentBOM Runtime Validation", () => {
  const validAgentBOM = {
    agentbom_version: "0.1" as const,
    identity: {
      agent_id: "test-agent-001",
      agent_name: "Test Agent",
      agent_version: "1.0.0",
      deployment_context: "production",
      generated_at: "2026-07-07T00:00:00Z",
    },
    model_layer: {
      provider: "anthropic",
      model_id: "claude-sonnet-4-6",
      model_version: "2025-06",
      capabilities: ["tool_use"],
    },
    tool_layer: [
      {
        tool_id: "file-read",
        tool_name: "Read",
        source: "builtin",
        permissions: ["fs:read"],
        risk_signals: [],
      },
      {
        tool_id: "file-write",
        tool_name: "Write",
        source: "builtin",
        permissions: ["fs:write"],
        risk_signals: [],
      },
      {
        tool_id: "bash-exec",
        tool_name: "Bash",
        source: "builtin",
        permissions: ["process:exec", "fs:read", "fs:write"],
        risk_signals: ["command_execution"],
      },
      {
        tool_id: "network-fetch",
        tool_name: "Fetch",
        source: "builtin",
        permissions: ["network:outbound"],
        risk_signals: ["ssrf"],
      },
    ],
    prompt_layer: {
      system_prompt_hash: "sha256:abcdef1234567890",
      template_ids: ["template-v1"],
    },
    permission_layer: {
      granted_scopes: ["fs:read", "fs:write", "process:exec", "network:outbound"],
      data_access: ["local_workspace"],
      credential_references: [],
    },
    attestation: {
      generator: "test-suite",
      generator_version: "1.0.0",
    },
  };

  describe("createRuntimeValidator", () => {
    it("creates a validator from a valid AgentBOM", () => {
      const validator = createRuntimeValidator(validAgentBOM);
      expect(validator).toBeDefined();
      expect(validator).not.toBeNull();
    });

    it("returns null for an invalid AgentBOM", () => {
      const invalidBOM = {
        agentbom_version: "0.1",
        // Missing required fields
      };
      const validator = createRuntimeValidator(invalidBOM);
      expect(validator).toBeNull();
    });

    it("returns null for malformed AgentBOM", () => {
      const malformedBOM = { not: "a valid bom" };
      const validator = createRuntimeValidator(malformedBOM);
      expect(validator).toBeNull();
    });
  });

  describe("validateToolInvocation", () => {
    let validator: RuntimeValidator;

    beforeEach(() => {
      validator = createRuntimeValidator(validAgentBOM)!;
    });

    it("allows access to declared tools with proper permissions", () => {
      const invocation: ToolInvocation = {
        tool_id: "file-read",
        tool_name: "Read",
        permissions: ["fs:read"],
      };

      const result = validator.validateToolInvocation(invocation);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.errorDetails).toHaveLength(0);
    });

    it("allows access to declared tools when permissions match granted scopes", () => {
      const invocation: ToolInvocation = {
        tool_id: "bash-exec",
        tool_name: "Bash",
        permissions: ["process:exec", "fs:read", "fs:write"],
      };

      const result = validator.validateToolInvocation(invocation);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects tools not declared in AgentBOM tool_layer", () => {
      const invocation: ToolInvocation = {
        tool_id: "undeclared-tool",
        tool_name: "Undeclared Tool",
        permissions: [],
      };

      const result = validator.validateToolInvocation(invocation);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not declared in AgentBOM");
      expect(result.errorDetails[0].type).toBe("unknown_tool");
      expect(result.errorDetails[0].tool_id).toBe("undeclared-tool");
    });

    it("rejects declared tools when requested permissions exceed tool's declared permissions", () => {
      const invocation: ToolInvocation = {
        tool_id: "file-read",
        tool_name: "Read",
        permissions: ["fs:read", "fs:write"], // fs:write is not in the tool's declared permissions
      };

      const result = validator.validateToolInvocation(invocation);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("exceeds its declared permissions");
      expect(result.errorDetails[0].type).toBe("undeclared_permission");
      expect(result.errorDetails[0].permission).toBe("fs:write");
    });

    it("rejects tools when requested permissions are not in tool's declared permissions", () => {
      const invocation: ToolInvocation = {
        tool_id: "network-fetch",
        tool_name: "Fetch",
        permissions: ["network:outbound", "admin:access"], // admin:access is not in tool's declared permissions
      };

      const result = validator.validateToolInvocation(invocation);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("exceeds its declared permissions");
      expect(result.errorDetails[0].permission).toBe("admin:access");
    });

    it("rejects tools when tool's declared permissions are not in granted_scopes", () => {
      // Create an AgentBOM where tool requires permissions not in granted_scopes
      const bomWithMissingPerms = {
        ...validAgentBOM,
        tool_layer: [
          {
            tool_id: "database-write",
            tool_name: "DB Write",
            source: "builtin",
            permissions: ["db:write"],
            risk_signals: [],
          },
        ],
        permission_layer: {
          granted_scopes: ["fs:read"], // db:write is not granted
          data_access: ["local_workspace"],
          credential_references: [],
        },
      };

      const validator = createRuntimeValidator(bomWithMissingPerms)!;
      const invocation: ToolInvocation = {
        tool_id: "database-write",
        tool_name: "DB Write",
        permissions: ["db:write"],
      };

      const result = validator.validateToolInvocation(invocation);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not in granted_scopes");
      expect(result.errorDetails[0].permission).toBe("db:write");
    });

    it("validates tools with no permissions requirement", () => {
      // Create an AgentBOM with a tool that has no permissions
      const bomWithNoPerms = {
        ...validAgentBOM,
        tool_layer: [
          {
            tool_id: "safe-tool",
            tool_name: "Safe Tool",
            source: "builtin",
            permissions: [],
            risk_signals: [],
          },
        ],
      };

      const validatorNoPerms = createRuntimeValidator(bomWithNoPerms)!;
      const invocation: ToolInvocation = {
        tool_id: "safe-tool",
        tool_name: "Safe Tool",
        permissions: [],
      };

      const result = validatorNoPerms.validateToolInvocation(invocation);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("checks AgentBOM-declared permissions even when not explicitly requested", () => {
      const invocation: ToolInvocation = {
        tool_id: "file-write",
        tool_name: "Write",
        permissions: [], // Not requesting permissions explicitly
      };

      const result = validator.validateToolInvocation(invocation);
      // Should be valid because fs:write IS in granted_scopes
      expect(result.valid).toBe(true);
    });

    it("rejects tools when AgentBOM-declared permissions are not in granted_scopes", () => {
      const invocation: ToolInvocation = {
        tool_id: "file-read",
        tool_name: "Read",
        permissions: [], // Not requesting permissions explicitly
      };

      const result = validator.validateToolInvocation(invocation);
      // Should be valid because fs:read IS in granted_scopes
      expect(result.valid).toBe(true);
    });
  });

  describe("validatePermissionScope", () => {
    let validator: RuntimeValidator;

    beforeEach(() => {
      validator = createRuntimeValidator(validAgentBOM)!;
    });

    it("allows access to granted permission scopes", () => {
      const request: PermissionRequest = {
        scope: "fs:read",
      };

      const result = validator.validatePermissionScope(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects permission scopes not in granted_scopes", () => {
      const request: PermissionRequest = {
        scope: "admin:access",
      };

      const result = validator.validatePermissionScope(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not in granted_scopes");
      expect(result.errorDetails[0].type).toBe("undeclared_permission");
      expect(result.errorDetails[0].permission).toBe("admin:access");
    });

    it("allows all scopes from granted_scopes", () => {
      const scopes = ["fs:read", "fs:write", "process:exec", "network:outbound"];
      for (const scope of scopes) {
        const request: PermissionRequest = { scope };
        const result = validator.validatePermissionScope(request);
        expect(result.valid).toBe(true);
      }
    });

    it("rejects multiple undeclared scopes", () => {
      const undeclaredScopes = ["db:write", "admin:root", "cloud:deploy"];
      for (const scope of undeclaredScopes) {
        const request: PermissionRequest = { scope };
        const result = validator.validatePermissionScope(request);
        expect(result.valid).toBe(false);
        expect(result.errorDetails[0].permission).toBe(scope);
      }
    });
  });

  describe("validateRuntimeRequest", () => {
    let validator: RuntimeValidator;

    beforeEach(() => {
      validator = createRuntimeValidator(validAgentBOM)!;
    });

    it("allows a complete valid runtime request", () => {
      const request: RuntimeRequest = {
        tool_invocations: [
          {
            tool_id: "file-read",
            tool_name: "Read",
            permissions: ["fs:read"],
          },
          {
            tool_id: "file-write",
            tool_name: "Write",
            permissions: ["fs:write"],
          },
        ],
        permission_requests: [
          { scope: "fs:read" },
          { scope: "fs:write" },
        ],
      };

      const result = validator.validateRuntimeRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects runtime request with undeclared tools", () => {
      const request: RuntimeRequest = {
        tool_invocations: [
          {
            tool_id: "file-read",
            tool_name: "Read",
            permissions: ["fs:read"],
          },
          {
            tool_id: "malicious-tool",
            tool_name: "Malicious Tool",
            permissions: [],
          },
        ],
        permission_requests: [],
      };

      const result = validator.validateRuntimeRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("malicious-tool"))).toBe(true);
      expect(
        result.errorDetails.some((d) => d.type === "unknown_tool")
      ).toBe(true);
    });

    it("rejects runtime request with undeclared permissions", () => {
      const request: RuntimeRequest = {
        tool_invocations: [],
        permission_requests: [
          { scope: "fs:read" },
          { scope: "admin:root" },
        ],
      };

      const result = validator.validateRuntimeRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("admin:root"))).toBe(true);
      expect(
        result.errorDetails.some((d) => d.type === "undeclared_permission")
      ).toBe(true);
    });

    it("collects all validation errors from both tools and permissions", () => {
      const request: RuntimeRequest = {
        tool_invocations: [
          {
            tool_id: "file-read",
            tool_name: "Read",
            permissions: ["fs:read"],
          },
          {
            tool_id: "unknown-tool",
            tool_name: "Unknown",
            permissions: [],
          },
          {
            tool_id: "network-fetch",
            tool_name: "Fetch",
            permissions: ["network:outbound", "admin:access"], // admin:access not granted
          },
        ],
        permission_requests: [
          { scope: "fs:read" },
          { scope: "db:delete" }, // Not granted
        ],
      };

      const result = validator.validateRuntimeRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errorDetails.length).toBeGreaterThanOrEqual(2);

      // Should have at least one unknown_tool error
      expect(
        result.errorDetails.some((d) => d.type === "unknown_tool")
      ).toBe(true);

      // Should have at least one undeclared_permission error
      expect(
        result.errorDetails.some((d) => d.type === "undeclared_permission")
      ).toBe(true);
    });

    it("handles empty runtime request", () => {
      const request: RuntimeRequest = {
        tool_invocations: [],
        permission_requests: [],
      };

      const result = validator.validateRuntimeRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validates complex multi-tool runtime scenario", () => {
      const request: RuntimeRequest = {
        tool_invocations: [
          {
            tool_id: "file-read",
            tool_name: "Read",
            permissions: ["fs:read"],
          },
          {
            tool_id: "file-write",
            tool_name: "Write",
            permissions: ["fs:write"],
          },
          {
            tool_id: "bash-exec",
            tool_name: "Bash",
            permissions: ["process:exec"],
          },
        ],
        permission_requests: [
          { scope: "fs:read" },
          { scope: "fs:write" },
          { scope: "process:exec" },
        ],
      };

      const result = validator.validateRuntimeRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Integration scenario: complete AgentBOM validation flow", () => {
    it("creates validator and validates complex runtime scenario", () => {
      // Create AgentBOM with multiple tools and limited permissions
      const restrictiveBOM = {
        ...validAgentBOM,
        permission_layer: {
          granted_scopes: ["fs:read"], // Only read access
          data_access: ["local_workspace"],
          credential_references: [],
        },
      };

      const validator = createRuntimeValidator(restrictiveBOM);
      expect(validator).not.toBeNull();

      // Try to use write tool - should fail due to missing permissions
      const writeInvocation: ToolInvocation = {
        tool_id: "file-write",
        tool_name: "Write",
        permissions: ["fs:write"],
      };

      const writeResult = validator.validateToolInvocation(writeInvocation);
      expect(writeResult.valid).toBe(false);
      expect(writeResult.errorDetails[0].type).toBe("undeclared_permission");

      // Try to use bash tool - should fail due to missing permissions
      const bashInvocation: ToolInvocation = {
        tool_id: "bash-exec",
        tool_name: "Bash",
        permissions: ["process:exec"],
      };

      const bashResult = validator.validateToolInvocation(bashInvocation);
      expect(bashResult.valid).toBe(false);
      expect(bashResult.errorDetails[0].type).toBe("undeclared_permission");

      // Read tool should work
      const readInvocation: ToolInvocation = {
        tool_id: "file-read",
        tool_name: "Read",
        permissions: ["fs:read"],
      };

      const readResult = validator.validateToolInvocation(readInvocation);
      expect(readResult.valid).toBe(true);

      // Validate a complete runtime request
      const runtimeRequest: RuntimeRequest = {
        tool_invocations: [
          {
            tool_id: "file-read",
            tool_name: "Read",
            permissions: ["fs:read"],
          },
          {
            tool_id: "file-write",
            tool_name: "Write",
            permissions: ["fs:write"],
          },
        ],
        permission_requests: [
          { scope: "fs:read" },
          { scope: "fs:write" },
        ],
      };

      const finalResult = validator.validateRuntimeRequest(runtimeRequest);
      expect(finalResult.valid).toBe(false);
      expect(finalResult.errors.length).toBeGreaterThan(0);
    });

    it("validates against AgentBOM with no permissions", () => {
      const bomNoPermissions = {
        ...validAgentBOM,
        tool_layer: [
          {
            tool_id: "simple-tool",
            tool_name: "Simple Tool",
            source: "builtin",
            permissions: [],
            risk_signals: [],
          },
        ],
        permission_layer: {
          granted_scopes: [],
          data_access: [],
          credential_references: [],
        },
      };

      const validator = createRuntimeValidator(bomNoPermissions);
      expect(validator).not.toBeNull();

      // Tool should be accessible
      const invocation: ToolInvocation = {
        tool_id: "simple-tool",
        tool_name: "Simple Tool",
        permissions: [],
      };

      const result = validator.validateToolInvocation(invocation);
      expect(result.valid).toBe(true);
    });
  });
});
