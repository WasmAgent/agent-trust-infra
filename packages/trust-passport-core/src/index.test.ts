import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTrustPassport, isExpired, inspectTrustPassport } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    expires_at: "2026-09-26T00:00:00Z",
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

describe("validateTrustPassport", () => {
  it("accepts a valid Trust Passport with all required fields", () => {
    const result = validateTrustPassport(VALID_PASSPORT);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects non-object root", () => {
    expect(validateTrustPassport(null).valid).toBe(false);
    expect(validateTrustPassport("string").valid).toBe(false);
    expect(validateTrustPassport(42).valid).toBe(false);
    expect(validateTrustPassport([]).valid).toBe(false);
  });

  it("rejects missing passport_version", () => {
    const { passport_version, ...rest } = VALID_PASSPORT;
    const result = validateTrustPassport(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required: passport_version");
  });

  it("rejects missing identity", () => {
    const { identity, ...rest } = VALID_PASSPORT;
    const result = validateTrustPassport(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required: identity");
  });

  it("rejects missing validity", () => {
    const { validity, ...rest } = VALID_PASSPORT;
    const result = validateTrustPassport(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required: validity");
  });

  it("rejects missing revocation", () => {
    const { revocation, ...rest } = VALID_PASSPORT;
    const result = validateTrustPassport(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required: revocation");
  });

  it("rejects missing attestation", () => {
    const { attestation, ...rest } = VALID_PASSPORT;
    const result = validateTrustPassport(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required: attestation");
  });

  it("rejects unknown passport_version", () => {
    const result = validateTrustPassport({ ...VALID_PASSPORT, passport_version: "99.0" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('passport_version must be "0.1"');
  });

  describe("validity object", () => {
    it("requires issued_at", () => {
      const passport = {
        ...VALID_PASSPORT,
        validity: { expires_at: "2026-09-26T00:00:00Z" },
      };
      const result = validateTrustPassport(passport);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("validity: missing issued_at");
    });

    it("requires expires_at", () => {
      const passport = {
        ...VALID_PASSPORT,
        validity: { issued_at: "2026-06-28T00:00:00Z" },
      };
      const result = validateTrustPassport(passport);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("validity: missing expires_at");
    });
  });

  describe("evidence_summary coverage enum", () => {
    it("accepts valid coverage values: selected_technical_evidence", () => {
      const passport = {
        ...VALID_PASSPORT,
        evidence_summary: {
          evidence_quality: "high",
          framework_mappings: [
            { framework: "OWASP-MCP-Top10", coverage: "selected_technical_evidence" },
          ],
        },
      };
      const result = validateTrustPassport(passport);
      expect(result.valid).toBe(true);
    });

    it("accepts valid coverage values: partial", () => {
      const passport = {
        ...VALID_PASSPORT,
        evidence_summary: {
          evidence_quality: "medium",
          framework_mappings: [
            { framework: "OWASP-MCP-Top10", coverage: "partial" },
          ],
        },
      };
      const result = validateTrustPassport(passport);
      expect(result.valid).toBe(true);
    });

    it("accepts valid coverage values: none", () => {
      const passport = {
        ...VALID_PASSPORT,
        evidence_summary: {
          evidence_quality: "low",
          framework_mappings: [
            { framework: "ISO-42001", coverage: "none" },
          ],
        },
      };
      const result = validateTrustPassport(passport);
      expect(result.valid).toBe(true);
    });

    it("rejects invalid coverage value", () => {
      const passport = {
        ...VALID_PASSPORT,
        evidence_summary: {
          evidence_quality: "high",
          framework_mappings: [
            { framework: "OWASP-MCP-Top10", coverage: "invalid_value" },
          ],
        },
      };
      const result = validateTrustPassport(passport);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("evidence_summary.framework_mappings.coverage: invalid value"))).toBe(
        true,
      );
    });
  });
});

describe("example file", () => {
  it("validates examples/passport-demo/trust-passport.json", () => {
    const examplePath = join(__dirname, "../../../examples/passport-demo/trust-passport.json");
    const raw = readFileSync(examplePath, "utf-8");
    const data = JSON.parse(raw);
    const result = validateTrustPassport(data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("isExpired", () => {
  it("returns false for a future expiry date", () => {
    expect(isExpired({ validity: { expires_at: "2099-12-31T00:00:00Z" } })).toBe(false);
  });

  it("returns true for a past expiry date", () => {
    expect(isExpired({ validity: { expires_at: "2020-01-01T00:00:00Z" } })).toBe(true);
  });

  it("returns false when validity is missing", () => {
    expect(isExpired({})).toBe(false);
  });
});

describe("inspectTrustPassport", () => {
  it("produces human-readable output", () => {
    const output = inspectTrustPassport(VALID_PASSPORT);
    expect(output).toContain("Trust Passport v0.1");
    expect(output).toContain("passport-test-001");
    expect(output).toContain("Test Agent");
    expect(output).toContain("2026-06-28T00:00:00Z");
    expect(output).toContain("2026-09-26T00:00:00Z");
    expect(output).toContain("Revoked:  false");
  });
});
