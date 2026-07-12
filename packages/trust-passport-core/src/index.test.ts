import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateTrustPassport,
  isExpired,
  inspectTrustPassport,
  isRecord,
  hashEvidence,
  addFact,
  type EvidenceFact,
} from "./index.js";

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

  describe("passport_version type validation", () => {
    it("rejects passport_version that is not a string", () => {
      const result = validateTrustPassport({ ...VALID_PASSPORT, passport_version: 42 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("passport_version must be a string");
    });
  });

  describe("identity object validation", () => {
    it("rejects identity that is not an object (string)", () => {
      const result = validateTrustPassport({ ...VALID_PASSPORT, identity: "not-an-object" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity must be an object");
    });

    it("rejects identity that is an array", () => {
      const result = validateTrustPassport({ ...VALID_PASSPORT, identity: ["passport"] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity must be an object");
    });

    it("rejects identity that is null", () => {
      const result = validateTrustPassport({ ...VALID_PASSPORT, identity: null });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity must be an object");
    });

    it("reports missing identity.passport_id", () => {
      const { passport_id, ...identityRest } = VALID_PASSPORT.identity;
      const result = validateTrustPassport({ ...VALID_PASSPORT, identity: identityRest });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity: missing passport_id");
    });

    it("reports missing identity.agent_id", () => {
      const { agent_id, ...identityRest } = VALID_PASSPORT.identity;
      const result = validateTrustPassport({ ...VALID_PASSPORT, identity: identityRest });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity: missing agent_id");
    });

    it("reports missing identity.agent_name", () => {
      const { agent_name, ...identityRest } = VALID_PASSPORT.identity;
      const result = validateTrustPassport({ ...VALID_PASSPORT, identity: identityRest });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity: missing agent_name");
    });

    it("reports missing identity.issuer", () => {
      const { issuer, ...identityRest } = VALID_PASSPORT.identity;
      const result = validateTrustPassport({ ...VALID_PASSPORT, identity: identityRest });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity: missing issuer");
    });

    it("reports missing identity.issuance_context", () => {
      const { issuance_context, ...identityRest } = VALID_PASSPORT.identity;
      const result = validateTrustPassport({ ...VALID_PASSPORT, identity: identityRest });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity: missing issuance_context");
    });

    it("rejects non-string identity.passport_id", () => {
      const result = validateTrustPassport({
        ...VALID_PASSPORT,
        identity: { ...VALID_PASSPORT.identity, passport_id: 123 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("identity.passport_id must be a string");
    });
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

    it("rejects validity that is not an object", () => {
      const result = validateTrustPassport({ ...VALID_PASSPORT, validity: "invalid" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("validity must be an object");
    });

    it("rejects non-string issued_at", () => {
      const result = validateTrustPassport({
        ...VALID_PASSPORT,
        validity: { issued_at: 123, expires_at: "2026-09-26T00:00:00Z" },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("validity.issued_at must be a string");
    });

    it("rejects malformed issued_at date string (no Z suffix)", () => {
      const result = validateTrustPassport({
        ...VALID_PASSPORT,
        validity: { issued_at: "2026-06-28", expires_at: "2026-09-26T00:00:00Z" },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("validity.issued_at must be an ISO 8601 UTC date string"))).toBe(true);
    });

    it("accepts ISO 8601 UTC dates with fractional seconds", () => {
      const result = validateTrustPassport({
        ...VALID_PASSPORT,
        validity: {
          issued_at: "2026-06-28T00:00:00.000Z",
          expires_at: "2026-09-26T00:00:00.500Z",
        },
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("revocation object validation", () => {
    it("rejects revocation that is not an object", () => {
      const result = validateTrustPassport({ ...VALID_PASSPORT, revocation: "invalid" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("revocation must be an object");
    });

    it("reports missing revocation.revoked", () => {
      const { revoked, ...revocationRest } = VALID_PASSPORT.revocation;
      const result = validateTrustPassport({ ...VALID_PASSPORT, revocation: revocationRest });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("revocation: missing revoked");
    });

    it("rejects non-boolean revocation.revoked", () => {
      const result = validateTrustPassport({
        ...VALID_PASSPORT,
        revocation: { revoked: "yes", revocation_triggers: [] },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("revocation.revoked must be a boolean");
    });

    it("reports missing revocation.revocation_triggers", () => {
      const { revocation_triggers, ...revocationRest } = VALID_PASSPORT.revocation;
      const result = validateTrustPassport({ ...VALID_PASSPORT, revocation: revocationRest });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("revocation: missing revocation_triggers");
    });

    it("rejects non-array revocation.revocation_triggers", () => {
      const result = validateTrustPassport({
        ...VALID_PASSPORT,
        revocation: { revoked: false, revocation_triggers: "not-array" },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("revocation.revocation_triggers must be an array");
    });
  });

  describe("attestation object validation", () => {
    it("rejects attestation that is not an object", () => {
      const result = validateTrustPassport({ ...VALID_PASSPORT, attestation: "invalid" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("attestation must be an object");
    });

    it("reports missing attestation.issuer", () => {
      const result = validateTrustPassport({
        ...VALID_PASSPORT,
        attestation: {},
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("attestation: missing issuer");
    });

    it("rejects non-string attestation.issuer", () => {
      const result = validateTrustPassport({
        ...VALID_PASSPORT,
        attestation: { issuer: 42 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("attestation.issuer must be a string");
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

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("returns false for non-objects", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
  });
});

describe("prototype pollution protection", () => {
  it("rejects root __proto__ key via JSON.parse", () => {
    // Object literal spread with __proto__ sets the prototype (not own property).
    // JSON.parse makes it an own property — the real attack vector.
    const base = JSON.stringify(VALID_PASSPORT);
    const malicious = JSON.parse(base.slice(0, -1) + ',"__proto__":{"polluted":true}}');
    const result = validateTrustPassport(malicious);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unsafe reserved keys"))).toBe(true);
  });

  it("rejects root constructor key", () => {
    const result = validateTrustPassport({ ...VALID_PASSPORT, constructor: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unsafe reserved keys"))).toBe(true);
  });

  it("rejects root prototype key", () => {
    const result = validateTrustPassport({ ...VALID_PASSPORT, prototype: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unsafe reserved keys"))).toBe(true);
  });

  it("rejects __proto__ in sub-objects (identity) via JSON.parse", () => {
    const passport = JSON.parse(JSON.stringify(VALID_PASSPORT));
    const identityJson = JSON.stringify(passport.identity);
    passport.identity = JSON.parse(identityJson.slice(0, -1) + ',"__proto__":{"polluted":true}}');
    const result = validateTrustPassport(passport);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("identity contains unsafe reserved keys"))).toBe(true);
  });

  it("rejects constructor in sub-objects (validity)", () => {
    const result = validateTrustPassport({
      ...VALID_PASSPORT,
      validity: { ...VALID_PASSPORT.validity, constructor: {} },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("validity contains unsafe reserved keys"))).toBe(true);
  });
});

// ────────────────────────────────────────────────
// Content-addressable evidence storage API tests
// ────────────────────────────────────────────────

describe("hashEvidence", () => {
  it("returns a sha256: prefixed hex string", () => {
    const hash = hashEvidence("hello");
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces deterministic output for the same input", () => {
    expect(hashEvidence("hello")).toBe(hashEvidence("hello"));
  });

  it("produces different output for different inputs", () => {
    expect(hashEvidence("hello")).not.toBe(hashEvidence("world"));
  });

  it("hashes empty string deterministically", () => {
    const hash = hashEvidence("");
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hash).toBe(hashEvidence(""));
  });

  it("hashes multi-line content", () => {
    const content = "line1\nline2\nline3";
    const hash = hashEvidence(content);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe("addFact", () => {
  it("adds a string evidence fact to the passport", () => {
    const passport = { ...VALID_PASSPORT };
    const result = addFact(passport, "fact-001", "some evidence content");
    expect(result).toBe(passport); // mutates in place
    expect(result.evidence_facts).toBeDefined();
    expect((result.evidence_facts as Record<string, unknown>)["fact-001"]).toBeDefined();
    const fact = (result.evidence_facts as Record<string, unknown>)["fact-001"] as EvidenceFact;
    expect(fact.content_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fact.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("adds a non-string evidence fact by JSON-stringifying it", () => {
    const passport = { ...VALID_PASSPORT };
    const content = { tool: "get_weather", args: { location: "NYC" } };
    const result = addFact(passport, "fact-002", content);
    const fact = (result.evidence_facts as Record<string, unknown>)["fact-002"] as EvidenceFact;
    expect(fact.content_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    // Verify it's the hash of the JSON string
    expect(fact.content_hash).toBe(hashEvidence(JSON.stringify(content)));
  });

  it("produces the same content_hash for identical content", () => {
    const passport1 = addFact({ ...VALID_PASSPORT }, "fact-001", "same content");
    const passport2 = addFact({ ...VALID_PASSPORT }, "fact-001", "same content");
    const fact1 = (passport1.evidence_facts as Record<string, unknown>)["fact-001"] as EvidenceFact;
    const fact2 = (passport2.evidence_facts as Record<string, unknown>)["fact-001"] as EvidenceFact;
    expect(fact1.content_hash).toBe(fact2.content_hash);
  });

  it("creates evidence_facts map when it does not exist", () => {
    const passport = { ...VALID_PASSPORT };
    expect(passport.evidence_facts).toBeUndefined();
    addFact(passport, "fact-001", "content");
    expect(passport.evidence_facts).toBeDefined();
  });

  it("merges into existing evidence_facts map", () => {
    const passport = { ...VALID_PASSPORT, evidence_facts: { existing: { content_hash: "sha256:old", recorded_at: new Date().toISOString() } } };
    addFact(passport, "fact-001", "new content");
    const facts = passport.evidence_facts as Record<string, unknown>;
    expect(facts["existing"]).toBeDefined();
    expect(facts["fact-001"]).toBeDefined();
  });

  it("replaces an existing fact with the same factId", () => {
    const passport = { ...VALID_PASSPORT };
    addFact(passport, "fact-001", "original content");
    const originalHash = (passport.evidence_facts as Record<string, unknown>)["fact-001"] as EvidenceFact;
    addFact(passport, "fact-001", "updated content");
    const updatedHash = (passport.evidence_facts as Record<string, unknown>)["fact-001"] as EvidenceFact;
    expect(updatedHash.content_hash).not.toBe(originalHash.content_hash);
  });

  it("returns a non-empty recorded_at timestamp", () => {
    const passport = addFact({ ...VALID_PASSPORT }, "fact-001", "content");
    const fact = (passport.evidence_facts as Record<string, unknown>)["fact-001"] as EvidenceFact;
    expect(fact.recorded_at.length).toBeGreaterThan(0);
  });
});
