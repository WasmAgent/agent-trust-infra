import { describe, it, expect } from "bun:test";
import { validateAgentBOM, diffAgentBOM, formatAgentBOMDiff } from "./index.js";

const VALID_AGENTBOM = {
  agentbom_version: "0.1",
  identity: {
    agent_id: "test-agent-001",
    agent_name: "Test Agent",
    deployment_context: "development",
    generated_at: "2026-06-28T00:00:00Z",
  },
  attestation: { generator: "test" },
};

describe("validateAgentBOM", () => {
  it("accepts valid AgentBOM", () => {
    const result = validateAgentBOM(VALID_AGENTBOM);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.errorDetails).toHaveLength(0);
  });

  it("rejects missing identity with a structured field-path error", () => {
    const result = validateAgentBOM({ agentbom_version: "0.1", attestation: { generator: "test" } });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    const identityErr = result.errorDetails.find((e) => e.field === "identity");
    expect(identityErr).toBeDefined();
    expect(identityErr?.keyword).toBe("required");
  });

  it("rejects unknown version with the field path pointing at agentbom_version", () => {
    const result = validateAgentBOM({ ...VALID_AGENTBOM, agentbom_version: "99.0" });
    expect(result.valid).toBe(false);
    const versionErr = result.errorDetails.find((e) => e.field === "agentbom_version");
    expect(versionErr).toBeDefined();
    expect(versionErr?.keyword).toBe("enum");
  });

  it("reports nested field paths for missing identity sub-fields", () => {
    const result = validateAgentBOM({
      ...VALID_AGENTBOM,
      identity: { agent_name: "Test Agent" },
    });
    expect(result.valid).toBe(false);
    const fields = result.errorDetails.map((e) => e.field);
    expect(fields).toContain("identity.agent_id");
    expect(fields).toContain("identity.generated_at");
    expect(result.errorDetails.every((e) => e.keyword === "required")).toBe(true);
  });

  it("rejects non-object root with a root field path", () => {
    const result = validateAgentBOM("not-a-bom");
    expect(result.valid).toBe(false);
    expect(result.errorDetails.length).toBeGreaterThan(0);
    expect(result.errorDetails[0].field).toBe("(root)");
  });
});

const BASE_BOM = {
  agentbom_version: "0.1",
  identity: {
    agent_id: "test-agent-001",
    agent_name: "Test Agent",
    deployment_context: "development",
    generated_at: "2026-06-28T00:00:00Z",
  },
  tool_layer: [
    { tool_id: "fs-read", tool_name: "read_file", source: "builtin", permissions: ["fs:read"], risk_signals: [] },
    { tool_id: "bash-exec", tool_name: "bash", source: "builtin", permissions: ["process:exec"], risk_signals: ["command_execution"] },
  ],
  permission_layer: {
    granted_scopes: ["fs:read", "process:exec"],
    data_access: ["local_workspace"],
    credential_references: [],
  },
  risk_layer: [
    { risk_id: "risk-001", severity: "medium", category: "command_execution", description: "bash allows arbitrary execution", status: "accepted" },
  ],
  attestation: { generator: "test" },
};

describe("diffAgentBOM", () => {
  it("returns empty diff for identical AgentBOMs", () => {
    const diff = diffAgentBOM(BASE_BOM, { ...BASE_BOM });
    expect(diff.isEmpty()).toBe(true);
  });

  it("detects added tools", () => {
    const newBom = {
      ...BASE_BOM,
      tool_layer: [
        ...BASE_BOM.tool_layer,
        { tool_id: "fs-write", tool_name: "write_file", source: "builtin", permissions: ["fs:write"], risk_signals: [] },
      ],
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.tools.added).toHaveLength(1);
    expect(diff.tools.added[0].tool_id).toBe("fs-write");
  });

  it("detects removed tools", () => {
    const newBom = {
      ...BASE_BOM,
      tool_layer: [BASE_BOM.tool_layer[0]],
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.tools.removed).toHaveLength(1);
    expect(diff.tools.removed[0].tool_id).toBe("bash-exec");
  });

  it("detects tool permission additions", () => {
    const newBom = {
      ...BASE_BOM,
      tool_layer: [
        { tool_id: "fs-read", tool_name: "read_file", source: "builtin", permissions: ["fs:read", "fs:write"], risk_signals: [] },
        { tool_id: "bash-exec", tool_name: "bash", source: "builtin", permissions: ["process:exec"], risk_signals: ["command_execution"] },
      ],
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.tools.modified).toHaveLength(1);
    expect(diff.tools.modified[0].tool_id).toBe("fs-read");
    expect(diff.tools.modified[0].field).toBe("permissions");
    expect(diff.tools.modified[0].new).toBe("fs:write");
  });

  it("detects tool permission removals", () => {
    const newBom = {
      ...BASE_BOM,
      tool_layer: [
        { tool_id: "fs-read", tool_name: "read_file", source: "builtin", permissions: [], risk_signals: [] },
        { tool_id: "bash-exec", tool_name: "bash", source: "builtin", permissions: ["process:exec"], risk_signals: ["command_execution"] },
      ],
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.tools.modified).toHaveLength(1);
    expect(diff.tools.modified[0].tool_id).toBe("fs-read");
    expect(diff.tools.modified[0].old).toBe("fs:read");
  });

  it("detects permission scope additions", () => {
    const newBom = {
      ...BASE_BOM,
      permission_layer: { granted_scopes: ["fs:read", "process:exec", "network:outbound"], data_access: ["local_workspace"], credential_references: [] },
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.permissions.added).toHaveLength(1);
    expect(diff.permissions.added[0]).toBe("network:outbound");
  });

  it("detects permission scope removals", () => {
    const newBom = {
      ...BASE_BOM,
      permission_layer: { granted_scopes: ["fs:read"], data_access: ["local_workspace"], credential_references: [] },
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.permissions.removed).toHaveLength(1);
    expect(diff.permissions.removed[0]).toBe("process:exec");
  });

  it("detects new risk entries", () => {
    const newBom = {
      ...BASE_BOM,
      risk_layer: [
        ...BASE_BOM.risk_layer,
        { risk_id: "risk-002", severity: "high", category: "exfiltration", description: "data exfiltration risk", status: "open" },
      ],
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.risks.added).toHaveLength(1);
    expect(diff.risks.added[0].risk_id).toBe("risk-002");
  });

  it("detects removed risk entries", () => {
    const newBom = {
      ...BASE_BOM,
      risk_layer: [],
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.risks.removed).toHaveLength(1);
    expect(diff.risks.removed[0].risk_id).toBe("risk-001");
  });

  it("detects risk severity changes", () => {
    const newBom = {
      ...BASE_BOM,
      risk_layer: [
        { risk_id: "risk-001", severity: "critical", category: "command_execution", description: "bash allows arbitrary execution", status: "accepted" },
      ],
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.risks.modified).toHaveLength(1);
    expect(diff.risks.modified[0].field).toBe("severity");
    expect(diff.risks.modified[0].old).toBe("medium");
    expect(diff.risks.modified[0].new).toBe("critical");
  });

  it("handles missing layers gracefully", () => {
    const minimal = {
      agentbom_version: "0.1",
      identity: BASE_BOM.identity,
      attestation: { generator: "test" },
    };
    const diff = diffAgentBOM(minimal, minimal);
    expect(diff.isEmpty()).toBe(true);
  });
});

describe("formatAgentBOMDiff", () => {
  it("shows clean message for empty diff", () => {
    const diff = diffAgentBOM(BASE_BOM, { ...BASE_BOM });
    const output = formatAgentBOMDiff(diff);
    expect(output).toContain("No differences found");
  });

  it("includes added tools in output", () => {
    const newBom = {
      ...BASE_BOM,
      tool_layer: [
        ...BASE_BOM.tool_layer,
        { tool_id: "net-fetch", tool_name: "fetch_url", source: "builtin", permissions: ["network:outbound"], risk_signals: [] },
      ],
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    const output = formatAgentBOMDiff(diff);
    expect(output).toContain("Tools added (1)");
    expect(output).toContain("+ fetch_url (net-fetch) [builtin]");
  });

  it("includes removed tools in output", () => {
    const newBom = { ...BASE_BOM, tool_layer: [BASE_BOM.tool_layer[0]] };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    const output = formatAgentBOMDiff(diff);
    expect(output).toContain("Tools removed (1)");
    expect(output).toContain("- bash (bash-exec) [builtin]");
  });

  it("includes permission changes in output", () => {
    const newBom = {
      ...BASE_BOM,
      permission_layer: { granted_scopes: ["fs:read", "process:exec", "network:outbound"], data_access: ["local_workspace"], credential_references: [] },
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    const output = formatAgentBOMDiff(diff);
    expect(output).toContain("Permission scopes added (1)");
    expect(output).toContain("+ network:outbound");
  });

  it("includes new risk entries in output", () => {
    const newBom = {
      ...BASE_BOM,
      risk_layer: [
        ...BASE_BOM.risk_layer,
        { risk_id: "risk-002", severity: "high", category: "exfiltration", description: "data exfiltration", status: "open" },
      ],
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    const output = formatAgentBOMDiff(diff);
    expect(output).toContain("Risk entries added (1)");
    expect(output).toContain("[high]");
    expect(output).toContain("risk-002");
    expect(output).toContain("data exfiltration");
  });

  it("includes tool permission changes in output", () => {
    const newBom = {
      ...BASE_BOM,
      tool_layer: [
        { tool_id: "fs-read", tool_name: "read_file", source: "builtin", permissions: ["fs:read", "fs:write"], risk_signals: [] },
        { tool_id: "bash-exec", tool_name: "bash", source: "builtin", permissions: ["process:exec"], risk_signals: ["command_execution"] },
      ],
    };
    const diff = diffAgentBOM(BASE_BOM, newBom);
    const output = formatAgentBOMDiff(diff);
    expect(output).toContain("Tools changed (1)");
    expect(output).toContain("permission added: fs:write");
  });
});
