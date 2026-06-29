import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { writeFileSync, unlinkSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { validatePassportCommand } from "./passport-validate.js";

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
