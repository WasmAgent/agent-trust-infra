import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMCPPosture, inspectMCPPosture } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RISK_CATEGORIES = [
  "ssrf",
  "exfiltration",
  "command_execution",
  "privilege_escalation",
  "prompt_injection",
  "credential_access",
  "supply_chain",
] as const;

const VALID_POSTURE = {
  posture_version: "0.1",
  identity: {
    snapshot_id: "posture-test-001",
    agent_id: "test-agent-001",
    captured_at: "2026-06-28T00:00:00Z",
  },
  servers: [
    {
      server_id: "test-server",
      server_name: "Test Server",
      tools: [
        {
          tool_id: "test-tool",
          tool_name: "test_tool",
        },
      ],
    },
  ],
  attestation: { generator: "test" },
};

describe("validateMCPPosture", () => {
  it("accepts valid MCP Posture", () => {
    const result = validateMCPPosture(VALID_POSTURE);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects non-object root", () => {
    expect(validateMCPPosture(null).valid).toBe(false);
    expect(validateMCPPosture("string").valid).toBe(false);
    expect(validateMCPPosture(42).valid).toBe(false);
    expect(validateMCPPosture([]).valid).toBe(false);
  });

  it("rejects missing posture_version", () => {
    const { posture_version, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("posture_version") && e.includes("required"))).toBe(true);
  });

  it("rejects missing identity", () => {
    const { identity, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("identity") && e.includes("required"))).toBe(true);
  });

  it("rejects missing servers", () => {
    const { servers, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("servers") && e.includes("required"))).toBe(true);
  });

  it("rejects missing attestation", () => {
    const { attestation, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("attestation") && e.includes("required"))).toBe(true);
  });

  it("rejects unknown posture_version", () => {
    const result = validateMCPPosture({ ...VALID_POSTURE, posture_version: "99.0" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("posture_version") && e.includes("allowed values"))).toBe(true);
  });

  describe("identity object", () => {
    it("requires snapshot_id", () => {
      const posture = {
        ...VALID_POSTURE,
        identity: { agent_id: "test-agent", captured_at: "2026-06-28T00:00:00Z" },
      };
      const result = validateMCPPosture(posture);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("identity") && e.includes("snapshot_id") && e.includes("required"))).toBe(true);
    });

    it("requires agent_id", () => {
      const posture = {
        ...VALID_POSTURE,
        identity: { snapshot_id: "snap-001", captured_at: "2026-06-28T00:00:00Z" },
      };
      const result = validateMCPPosture(posture);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("identity") && e.includes("agent_id") && e.includes("required"))).toBe(true);
    });

    it("requires captured_at", () => {
      const posture = {
        ...VALID_POSTURE,
        identity: { snapshot_id: "snap-001", agent_id: "test-agent" },
      };
      const result = validateMCPPosture(posture);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("identity") && e.includes("captured_at") && e.includes("required"))).toBe(true);
    });
  });
});

describe("schema risk categories", () => {
  it("includes all 7 risk categories from the taxonomy", () => {
    // Verify the schema file contains all 7 risk category enums
    const schemaPath = join(__dirname, "../../../specs/mcp-posture/schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);

    const toolRiskCategories =
      (schema.properties?.servers?.items?.properties?.tools?.items?.properties?.risk_categories?.items?.enum as string[]) ?? [];
    for (const cat of RISK_CATEGORIES) {
      expect(toolRiskCategories).toContain(cat);
    }
    expect(toolRiskCategories).toHaveLength(7);
  });

  it("risk_summary.category also has all 7 risk categories in the enum", () => {
    const schemaPath = join(__dirname, "../../../specs/mcp-posture/schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);

    const summaryCategoryEnum =
      (schema.properties?.risk_summary?.items?.properties?.category?.enum as string[]) ?? [];
    for (const cat of RISK_CATEGORIES) {
      expect(summaryCategoryEnum).toContain(cat);
    }
    expect(summaryCategoryEnum).toHaveLength(7);
  });
});

describe("schema covers all fields from posture-model-v0.1.md", () => {
  it("has top-level fields: identity, servers, permission_graph, risk_summary, drift, attestation", () => {
    const schemaPath = join(__dirname, "../../../specs/mcp-posture/schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);

    const props = schema.properties;
    expect(props).toHaveProperty("identity");
    expect(props).toHaveProperty("servers");
    expect(props).toHaveProperty("permission_graph");
    expect(props).toHaveProperty("risk_summary");
    expect(props).toHaveProperty("drift");
    expect(props).toHaveProperty("attestation");
  });

  it("requires posture_version, identity, servers, and attestation", () => {
    const schemaPath = join(__dirname, "../../../specs/mcp-posture/schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);

    const required = schema.required as string[];
    expect(required).toContain("posture_version");
    expect(required).toContain("identity");
    expect(required).toContain("servers");
    expect(required).toContain("attestation");
  });
});

describe("example file validation", () => {
  const examplePath = join(__dirname, "../../../examples/mcp-risk-demo/posture.json");
  let exampleData: any;

  function loadExample() {
    const raw = readFileSync(examplePath, "utf-8");
    exampleData = JSON.parse(raw);
  }

  it("validates examples/mcp-risk-demo/posture.json", () => {
    loadExample();
    const result = validateMCPPosture(exampleData);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("has at least 2 MCP servers", () => {
    loadExample();
    expect(exampleData.servers.length).toBeGreaterThanOrEqual(2);
  });

  it("has at least one tool with high risk severity", () => {
    loadExample();
    const highRiskTools = exampleData.servers.flatMap(
      (s: any) => s.tools?.filter((t: any) => t.risk_severity === "high") ?? []
    );
    expect(highRiskTools.length).toBeGreaterThanOrEqual(1);
  });

  it("includes a non-empty permission_graph", () => {
    loadExample();
    expect(exampleData.permission_graph).toBeDefined();
    expect(exampleData.permission_graph).not.toEqual({});
  });

  it("includes at least 2 risk_summary entries", () => {
    loadExample();
    expect(exampleData.risk_summary.length).toBeGreaterThanOrEqual(2);
  });
});

describe("inspectMCPPosture", () => {
  it("produces human-readable output", () => {
    const output = inspectMCPPosture(VALID_POSTURE);
    expect(output).toContain("MCP Posture v0.1");
    expect(output).toContain("posture-test-001");
    expect(output).toContain("test-agent-001");
    expect(output).toContain("Servers:");
  });
});
