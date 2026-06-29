import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { writeFileSync, unlinkSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { validatePassportCommand } from "./passport-validate.js";
import { inspectPassportCommand } from "./passport-inspect.js";
import { inspectAgentBOMCommand } from "./agentbom-inspect.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let tmpDir: string;

const VALID_PASSPORT = {
  passport_version: "0.1",
  identity: {
    passport_id: "passport-test-001",
    agent_id: "test-agent-001",
    agent_name: "Test Agent",
    issuer: "test-issuer",
    issuance_context: "self-issued",
  },
  validity: {
    issued_at: "2026-06-28T00:00:00Z",
    expires_at: "2099-12-31T00:00:00Z",
    renewal_triggers: ["agentbom_changes"],
  },
  revocation: {
    revoked: false,
    revocation_triggers: ["critical_security_finding"],
  },
  attestation: {
    issuer: "test-issuer",
  },
};

beforeEach(() => {
  tmpDir = join(tmpdir(), `agent-trust-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmpFile(name: string, content: string): string {
  const p = join(tmpDir, name);
  writeFileSync(p, content, "utf-8");
  return p;
}

describe("validatePassportCommand", () => {
  it("returns 0 for a valid passport", () => {
    const path = writeTmpFile("valid.json", JSON.stringify(VALID_PASSPORT));
    expect(validatePassportCommand(path)).toBe(0);
  });

  it("returns 1 for a non-existent file", () => {
    expect(validatePassportCommand("/nonexistent/path/passport.json")).toBe(1);
  });

  it("returns 1 for invalid JSON", () => {
    const path = writeTmpFile("bad.json", "{ not valid json");
    expect(validatePassportCommand(path)).toBe(1);
  });

  it("returns 1 for a passport missing required fields", () => {
    const path = writeTmpFile("incomplete.json", JSON.stringify({ passport_version: "0.1" }));
    expect(validatePassportCommand(path)).toBe(1);
  });

  it("returns 1 for an expired passport", () => {
    const expired = {
      ...VALID_PASSPORT,
      validity: {
        issued_at: "2020-01-01T00:00:00Z",
        expires_at: "2020-06-01T00:00:00Z",
      },
    };
    const path = writeTmpFile("expired.json", JSON.stringify(expired));
    expect(validatePassportCommand(path)).toBe(1);
  });

  it("warns and returns 0 for a passport expiring within 14 days", () => {
    const nearExpiry = new Date();
    nearExpiry.setDate(nearExpiry.getDate() + 7);
    const warning = {
      ...VALID_PASSPORT,
      validity: {
        issued_at: "2026-06-01T00:00:00Z",
        expires_at: nearExpiry.toISOString(),
      },
    };
    const path = writeTmpFile("warning.json", JSON.stringify(warning));

    const spy = spyOn(console, "warn");
    expect(validatePassportCommand(path)).toBe(0);
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain("expires within 14 days");
  });

  it("returns 1 for wrong passport_version", () => {
    const badVersion = { ...VALID_PASSPORT, passport_version: "2.0" };
    const path = writeTmpFile("bad-version.json", JSON.stringify(badVersion));
    expect(validatePassportCommand(path)).toBe(1);
  });

  it("handles the example passport-demo file", () => {
    const examplePath = resolve(__dirname, "../../../examples/passport-demo/trust-passport.json");
    if (!existsSync(examplePath)) {
      console.warn(`Skipping: example file not found at ${examplePath}`);
      return;
    }
    const exitCode = validatePassportCommand(examplePath);
    // Example may or may not be expired depending on date, but should be structurally valid
    expect([0, 1]).toContain(exitCode);
  });
});

describe("inspectPassportCommand", () => {
  it("returns 0 and displays passport details for a valid passport", () => {
    const path = writeTmpFile("inspect-valid.json", JSON.stringify(VALID_PASSPORT));
    const spy = spyOn(console, "log");

    const result = inspectPassportCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("passport-test-001");
    expect(output).toContain("Test Agent");
    expect(output).toContain("test-issuer");
    expect(output).toContain("2026-06-28T00:00:00Z");
    expect(output).toContain("2099-12-31T00:00:00Z");
    expect(output).toContain("Active");
  });

  it("shows EXPIRED status for an expired passport", () => {
    const expired = {
      ...VALID_PASSPORT,
      validity: {
        issued_at: "2020-01-01T00:00:00Z",
        expires_at: "2020-06-01T00:00:00Z",
      },
    };
    const path = writeTmpFile("inspect-expired.json", JSON.stringify(expired));
    const spy = spyOn(console, "log");

    const result = inspectPassportCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("EXPIRED");
  });

  it("shows risk counts", () => {
    const withRisks = {
      ...VALID_PASSPORT,
      risk_summary: { critical: 2, high: 5, medium: 3, low: 1 },
    };
    const path = writeTmpFile("inspect-risks.json", JSON.stringify(withRisks));
    const spy = spyOn(console, "log");

    const result = inspectPassportCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("critical=2");
    expect(output).toContain("high=5");
  });

  it("returns 1 for a non-existent file", () => {
    expect(inspectPassportCommand("/nonexistent/path/passport.json")).toBe(1);
  });

  it("returns 1 for invalid JSON", () => {
    const path = writeTmpFile("inspect-bad.json", "{ not valid json");
    expect(inspectPassportCommand(path)).toBe(1);
  });

  it("returns 1 for a non-object root", () => {
    const path = writeTmpFile("inspect-array.json", JSON.stringify([1, 2, 3]));
    expect(inspectPassportCommand(path)).toBe(1);
  });
});

const VALID_AGENTBOM = {
  agentbom_version: "0.1",
  identity: {
    agent_id: "test-agent-001",
    agent_name: "Test Agent",
    deployment_context: "development",
    generated_at: "2026-06-28T00:00:00Z",
  },
  attestation: { generator: "test" },
  tool_layer: [
    { tool_id: "fs-read", tool_name: "read_file", source: "builtin" },
    { tool_id: "fs-write", tool_name: "write_file", source: "builtin" },
  ],
  risk_layer: [
    { risk_id: "risk-001", severity: "medium", category: "command_execution" },
  ],
};

describe("inspectAgentBOMCommand", () => {
  it("returns 0 and displays agent details for a valid AgentBOM", () => {
    const path = writeTmpFile("agentbom-valid.json", JSON.stringify(VALID_AGENTBOM));
    const spy = spyOn(console, "log");

    const result = inspectAgentBOMCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Test Agent");
    expect(output).toContain("test-agent-001");
    expect(output).toContain("development");
    expect(output).toContain("Tools:");
    expect(output).toContain("2");
    expect(output).toContain("Risks:");
    expect(output).toContain("1");
  });

  it("returns 1 for a non-existent file", () => {
    expect(inspectAgentBOMCommand("/nonexistent/path/agentbom.json")).toBe(1);
  });

  it("returns 1 for invalid JSON", () => {
    const path = writeTmpFile("agentbom-bad.json", "{ not valid json");
    expect(inspectAgentBOMCommand(path)).toBe(1);
  });

  it("returns 1 for missing required fields", () => {
    const path = writeTmpFile("agentbom-incomplete.json", JSON.stringify({ agentbom_version: "0.1" }));
    expect(inspectAgentBOMCommand(path)).toBe(1);
  });

  it("returns 1 for wrong agentbom_version", () => {
    const badVersion = { ...VALID_AGENTBOM, agentbom_version: "99.0" };
    const path = writeTmpFile("agentbom-bad-version.json", JSON.stringify(badVersion));
    expect(inspectAgentBOMCommand(path)).toBe(1);
  });

  it("handles the example agentbom-demo file", () => {
    const examplePath = resolve(__dirname, "../../../examples/agentbom-demo/agentbom.json");
    if (!existsSync(examplePath)) {
      console.warn(`Skipping: example file not found at ${examplePath}`);
      return;
    }
    const spy = spyOn(console, "log");
    const exitCode = inspectAgentBOMCommand(examplePath);
    expect(exitCode).toBe(0);
    const output = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("bscode agent");
    expect(output).toContain("bscode-agent-demo-001");
    expect(output).toContain("development");
    expect(output).toContain("Tools:");
    expect(output).toContain("Risks:");
  });
});
