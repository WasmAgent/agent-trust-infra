import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateMCPPosture,
  inspectMCPPosture,
  RISK_CATEGORIES,
  RISK_SEVERITIES,
  SESSION_MODELS,
  HANDLE_EXPIRY_POLICIES,
} from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    expect(result.errors).toContain("missing required: posture_version");
  });

  it("rejects missing identity", () => {
    const { identity, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required: identity");
  });

  it("rejects missing servers", () => {
    const { servers, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required: servers");
  });

  it("rejects missing attestation", () => {
    const { attestation, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required: attestation");
  });

  it("rejects unknown posture_version", () => {
    const result = validateMCPPosture({ ...VALID_POSTURE, posture_version: "99.0" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('posture_version must be "0.1"');
  });

  describe("identity object", () => {
    it("requires snapshot_id", () => {
      const posture = {
        ...VALID_POSTURE,
        identity: { agent_id: "test-agent", captured_at: "2026-06-28T00:00:00Z" },
      };
      const result = validateMCPPosture(posture);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity: missing snapshot_id");
    });

    it("requires agent_id", () => {
      const posture = {
        ...VALID_POSTURE,
        identity: { snapshot_id: "snap-001", captured_at: "2026-06-28T00:00:00Z" },
      };
      const result = validateMCPPosture(posture);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity: missing agent_id");
    });

    it("requires captured_at", () => {
      const posture = {
        ...VALID_POSTURE,
        identity: { snapshot_id: "snap-001", agent_id: "test-agent" },
      };
      const result = validateMCPPosture(posture);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity: missing captured_at");
    });
  });
});

describe("protocol_version validation", () => {
  it("accepts valid protocol_version values", () => {
    for (const pv of ["2026-07-28", "2025-03-26"] as const) {
      const result = validateMCPPosture({ ...VALID_POSTURE, protocol_version: pv });
      expect(result.valid).toBe(true);
    }
  });

  it("rejects invalid protocol_version", () => {
    const result = validateMCPPosture({ ...VALID_POSTURE, protocol_version: "2099-01-01" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('protocol_version must be "2026-07-28" or "2025-03-26"');
  });

  it("accepts omission of protocol_version (backward compatible)", () => {
    const result = validateMCPPosture(VALID_POSTURE);
    expect(result.valid).toBe(true);
  });
});

describe("session_model and handle_expiry_policy validation", () => {
  it("accepts all valid session_model values", () => {
    for (const sm of SESSION_MODELS) {
      const posture = {
        ...VALID_POSTURE,
        servers: [{ ...VALID_POSTURE.servers[0], session_model: sm }],
      };
      expect(validateMCPPosture(posture).valid).toBe(true);
    }
  });

  it("rejects invalid session_model", () => {
    const posture = {
      ...VALID_POSTURE,
      servers: [{ ...VALID_POSTURE.servers[0], session_model: "invalid" }],
    };
    const result = validateMCPPosture(posture);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("session_model"))).toBe(true);
  });

  it("accepts all valid handle_expiry_policy values", () => {
    for (const hep of HANDLE_EXPIRY_POLICIES) {
      const posture = {
        ...VALID_POSTURE,
        servers: [{ ...VALID_POSTURE.servers[0], handle_expiry_policy: hep }],
      };
      expect(validateMCPPosture(posture).valid).toBe(true);
    }
  });

  it("rejects invalid handle_expiry_policy", () => {
    const posture = {
      ...VALID_POSTURE,
      servers: [{ ...VALID_POSTURE.servers[0], handle_expiry_policy: "perpetual" }],
    };
    const result = validateMCPPosture(posture);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("handle_expiry_policy"))).toBe(true);
  });
});

describe("attestation.auth validation", () => {
  it("accepts valid auth fields", () => {
    const posture = {
      ...VALID_POSTURE,
      attestation: {
        generator: "test",
        auth: {
          audience_bound_token_validated: true,
          pkce_used: true,
          per_client_consent_verified: false,
        },
      },
    };
    const result = validateMCPPosture(posture);
    expect(result.valid).toBe(true);
  });

  it("rejects non-boolean auth fields", () => {
    const posture = {
      ...VALID_POSTURE,
      attestation: {
        generator: "test",
        auth: {
          audience_bound_token_validated: "yes",
        },
      },
    };
    const result = validateMCPPosture(posture);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("attestation.auth.audience_bound_token_validated must be a boolean");
  });

  it("accepts omission of auth (backward compatible)", () => {
    const result = validateMCPPosture(VALID_POSTURE);
    expect(result.valid).toBe(true);
  });
});

describe("risk_categories validation", () => {
  it("rejects unknown risk_category in tool", () => {
    const posture = {
      ...VALID_POSTURE,
      servers: [
        {
          ...VALID_POSTURE.servers[0],
          tools: [{ tool_id: "t1", tool_name: "t1", risk_categories: ["bogus"] }],
        },
      ],
    };
    const result = validateMCPPosture(posture);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("bogus"))).toBe(true);
  });

  it("accepts mcp_header_leakage as a risk category", () => {
    const posture = {
      ...VALID_POSTURE,
      servers: [
        {
          ...VALID_POSTURE.servers[0],
          tools: [{ tool_id: "t1", tool_name: "t1", risk_categories: ["mcp_header_leakage"] }],
        },
      ],
    };
    const result = validateMCPPosture(posture);
    expect(result.valid).toBe(true);
  });
});

describe("schema risk categories", () => {
  it("includes all 8 risk categories from the taxonomy (including mcp_header_leakage)", () => {
    const schemaPath = join(__dirname, "../../../specs/mcp-posture/schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);

    const toolRiskCategories =
      (schema.properties?.servers?.items?.properties?.tools?.items?.properties?.risk_categories?.items?.enum as string[]) ?? [];
    for (const cat of RISK_CATEGORIES) {
      expect(toolRiskCategories).toContain(cat);
    }
    expect(toolRiskCategories).toHaveLength(8);
  });

  it("risk_summary.category also has all 8 risk categories in the enum", () => {
    const schemaPath = join(__dirname, "../../../specs/mcp-posture/schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);

    const summaryCategoryEnum =
      (schema.properties?.risk_summary?.items?.properties?.category?.enum as string[]) ?? [];
    for (const cat of RISK_CATEGORIES) {
      expect(summaryCategoryEnum).toContain(cat);
    }
    expect(summaryCategoryEnum).toHaveLength(8);
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

  it("has protocol_version as optional field", () => {
    const schemaPath = join(__dirname, "../../../specs/mcp-posture/schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);

    expect(schema.properties).toHaveProperty("protocol_version");
    expect((schema.required as string[])).not.toContain("protocol_version");
  });

  it("has session_model and handle_expiry_policy on server items", () => {
    const schemaPath = join(__dirname, "../../../specs/mcp-posture/schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);

    const serverProps = schema.properties?.servers?.items?.properties;
    expect(serverProps).toHaveProperty("session_model");
    expect(serverProps).toHaveProperty("handle_expiry_policy");
  });

  it("has owasp_agentic_ref on risk_summary items", () => {
    const schemaPath = join(__dirname, "../../../specs/mcp-posture/schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);

    const findingProps = schema.properties?.risk_summary?.items?.properties;
    expect(findingProps).toHaveProperty("owasp_agentic_ref");
  });

  it("has auth with audience_bound_token_validated, pkce_used, per_client_consent_verified on attestation", () => {
    const schemaPath = join(__dirname, "../../../specs/mcp-posture/schema.json");
    const raw = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw);

    const attestationProps = schema.properties?.attestation?.properties;
    expect(attestationProps).toHaveProperty("auth");
    const authProps = attestationProps?.auth?.properties;
    expect(authProps).toHaveProperty("audience_bound_token_validated");
    expect(authProps).toHaveProperty("pkce_used");
    expect(authProps).toHaveProperty("per_client_consent_verified");
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

describe("MCP 2026-07-28 test fixture validation", () => {
  const fixturePath = join(__dirname, "../../../test/fixtures/posture-mcp-2026-07-28.json");
  let fixtureData: any;

  function loadFixture() {
    const raw = readFileSync(fixturePath, "utf-8");
    fixtureData = JSON.parse(raw);
  }

  it("validates the 2026-07-28 fixture", () => {
    loadFixture();
    const result = validateMCPPosture(fixtureData);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("has protocol_version 2026-07-28", () => {
    loadFixture();
    expect(fixtureData.protocol_version).toBe("2026-07-28");
  });

  it("has at least one server with session_model stateless-handle", () => {
    loadFixture();
    const stateless = fixtureData.servers.filter((s: any) => s.session_model === "stateless-handle");
    expect(stateless.length).toBeGreaterThanOrEqual(1);
  });

  it("has attestation.auth with audience-bound token fields", () => {
    loadFixture();
    expect(fixtureData.attestation.auth).toBeDefined();
    expect(fixtureData.attestation.auth.audience_bound_token_validated).toBe(true);
    expect(fixtureData.attestation.auth.pkce_used).toBe(true);
  });

  it("includes mcp_header_leakage risk category on at least one tool", () => {
    loadFixture();
    const headerLeakTools = fixtureData.servers.flatMap(
      (s: any) => s.tools?.filter((t: any) => t.risk_categories?.includes("mcp_header_leakage")) ?? []
    );
    expect(headerLeakTools.length).toBeGreaterThanOrEqual(1);
  });

  it("includes owasp_agentic_ref on at least one risk_summary entry", () => {
    loadFixture();
    const withAgentic = fixtureData.risk_summary.filter((r: any) => r.owasp_agentic_ref);
    expect(withAgentic.length).toBeGreaterThanOrEqual(1);
  });

  it("has a mcp_header_leakage risk_summary entry", () => {
    loadFixture();
    const headerLeakFindings = fixtureData.risk_summary.filter(
      (r: any) => r.category === "mcp_header_leakage"
    );
    expect(headerLeakFindings.length).toBeGreaterThanOrEqual(1);
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

  it("shows protocol_version when present", () => {
    const output = inspectMCPPosture({ ...VALID_POSTURE, protocol_version: "2026-07-28" });
    expect(output).toContain("(2026-07-28)");
  });

  it("shows stateless-handle server count", () => {
    const posture = {
      ...VALID_POSTURE,
      servers: [
        { ...VALID_POSTURE.servers[0], session_model: "stateless-handle" },
      ],
    };
    const output = inspectMCPPosture(posture);
    expect(output).toContain("Stateless-handle servers: 1");
  });

  it("shows owasp_agentic_ref in findings", () => {
    const posture = {
      ...VALID_POSTURE,
      risk_summary: [
        {
          finding_id: "f-001",
          severity: "high",
          category: "mcp_header_leakage",
          description: "test finding",
          owasp_agentic_ref: "ASI04",
        },
      ],
    };
    const output = inspectMCPPosture(posture);
    expect(output).toContain("[ASI04]");
  });
});
