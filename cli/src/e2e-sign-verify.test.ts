/**
 * E2E test: generate keypair → sign passport → verify → revoke.
 *
 * Tests the full flow: key generation, passport signing, verification,
 * revocation, and failure cases (expired passport, wrong key, revoked passport).
 */
import { describe, test, expect } from "bun:test";
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { signPassport } from "./passport-sign.js";
import { verifySignedPassport } from "./passport-verify-signed.js";
import { revokePassportFile } from "./passport-revoke.js";
import { revokePassport } from "../../packages/trust-passport-core/src/index.js";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "trust-e2e-"));
}

function createMinimalPassport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    passport_version: "0.1",
    identity: {
      passport_id: "test-passport-001",
      agent_id: "test-agent-001",
      agent_name: "Test Agent",
      issuer: "e2e-test",
      issuance_context: "self-issued",
    },
    validity: {
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    },
    revocation: {
      revoked: false,
      revocation_triggers: ["critical_security_finding"],
    },
    attestation: {
      issuer: "e2e-test",
    },
    ...overrides,
  };
}

function writeKeyPairFiles(tempDir: string): { privateKeyPath: string; publicKeyPath: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;

  const privateKeyPath = join(tempDir, "private.pem");
  const publicKeyPath = join(tempDir, "public.pem");

  writeFileSync(privateKeyPath, privateKeyPem, "utf-8");
  writeFileSync(publicKeyPath, publicKeyPem, "utf-8");

  return { privateKeyPath, publicKeyPath };
}

describe("E2E: sign → verify flow", () => {
  let tempDir: string;

  test("full flow: generate keypair, sign passport, verify signature", () => {
    tempDir = createTempDir();
    try {
      // Step 1: Generate Ed25519 keypair
      const { privateKeyPath, publicKeyPath } = writeKeyPairFiles(tempDir);

      // Step 2: Create a minimal valid Trust Passport
      const passport = createMinimalPassport();
      const passportPath = join(tempDir, "passport.json");
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), "utf-8");

      // Step 3: Sign the passport
      const jwt = signPassport({
        artifactPath: passportPath,
        keyPath: privateKeyPath,
      });

      expect(jwt).toBeTruthy();
      expect(jwt.split(".")).toHaveLength(3);

      // Step 4: Verify the signed JWT
      const result = verifySignedPassport({
        jwtString: jwt,
        publicKeyPath,
      });

      expect(result.valid).toBe(true);
      expect(result.signatureValid).toBe(true);
      expect(result.expired).toBe(false);
      expect(result.structureValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.payload).not.toBeNull();
      expect((result.payload as Record<string, unknown>).passport_version).toBe("0.1");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("sign adds default expiry when not present", () => {
    tempDir = createTempDir();
    try {
      const { privateKeyPath, publicKeyPath } = writeKeyPairFiles(tempDir);

      // Passport without expires_at
      const passport = createMinimalPassport({
        validity: {
          issued_at: new Date().toISOString(),
          // expires_at intentionally omitted
        },
      });
      const passportPath = join(tempDir, "passport-no-expiry.json");
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), "utf-8");

      const jwt = signPassport({
        artifactPath: passportPath,
        keyPath: privateKeyPath,
      });

      const result = verifySignedPassport({
        jwtString: jwt,
        publicKeyPath,
      });

      expect(result.valid).toBe(true);
      expect(result.expired).toBe(false);
      // Check that exp claim was set
      expect(result.payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("sign with custom --expires duration", () => {
    tempDir = createTempDir();
    try {
      const { privateKeyPath, publicKeyPath } = writeKeyPairFiles(tempDir);

      const passport = createMinimalPassport({
        validity: {
          issued_at: new Date().toISOString(),
        },
      });
      const passportPath = join(tempDir, "passport-custom-expiry.json");
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), "utf-8");

      const jwt = signPassport({
        artifactPath: passportPath,
        keyPath: privateKeyPath,
        expires: "90d",
      });

      const result = verifySignedPassport({
        jwtString: jwt,
        publicKeyPath,
      });

      expect(result.valid).toBe(true);
      // exp should be approximately 90 days from now
      const expectedExp = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
      expect(Math.abs((result.payload?.exp as number) - expectedExp)).toBeLessThan(10);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("verify fails with wrong public key", () => {
    tempDir = createTempDir();
    try {
      const { privateKeyPath } = writeKeyPairFiles(tempDir);

      // Generate a different keypair for verification
      const wrongKeyPair = generateKeyPairSync("ed25519");
      const wrongPubPem = wrongKeyPair.publicKey.export({ type: "spki", format: "pem" }) as string;
      const wrongPubPath = join(tempDir, "wrong-public.pem");
      writeFileSync(wrongPubPath, wrongPubPem, "utf-8");

      const passport = createMinimalPassport();
      const passportPath = join(tempDir, "passport.json");
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), "utf-8");

      const jwt = signPassport({
        artifactPath: passportPath,
        keyPath: privateKeyPath,
      });

      const result = verifySignedPassport({
        jwtString: jwt,
        publicKeyPath: wrongPubPath,
      });

      expect(result.valid).toBe(false);
      expect(result.signatureValid).toBe(false);
      expect(result.errors.some((e) => e.includes("Signature verification failed"))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("verify fails for expired passport (revocation proxy)", () => {
    tempDir = createTempDir();
    try {
      const { privateKeyPath, publicKeyPath } = writeKeyPairFiles(tempDir);

      // Create a passport that is already expired
      const passport = createMinimalPassport({
        validity: {
          issued_at: "2020-01-01T00:00:00Z",
          expires_at: "2020-06-01T00:00:00Z", // expired in the past
        },
      });
      const passportPath = join(tempDir, "passport-expired.json");
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), "utf-8");

      const jwt = signPassport({
        artifactPath: passportPath,
        keyPath: privateKeyPath,
      });

      const result = verifySignedPassport({
        jwtString: jwt,
        publicKeyPath,
      });

      expect(result.valid).toBe(false);
      expect(result.expired).toBe(true);
      expect(result.signatureValid).toBe(true); // signature is still valid
      expect(result.errors.some((e) => e.includes("expired"))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("verify fails for malformed JWT", () => {
    const result = verifySignedPassport({
      jwtString: "not.a.valid-jwt",
    });

    // No public key provided, so signature cannot be verified
    expect(result.valid).toBe(false);
  });

  test("verify with hex key format", () => {
    tempDir = createTempDir();
    try {
      // Generate keypair
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");

      // Export private key as raw seed (32 bytes hex)
      const privRaw = privateKey.export({ type: "pkcs8", format: "der" });
      // Ed25519 PKCS#8 DER: the last 32 bytes are the seed
      const seed = (privRaw as Buffer).subarray(-32);
      const privateHexPath = join(tempDir, "private.hex");
      writeFileSync(privateHexPath, seed.toString("hex"), "utf-8");

      // Export public key as raw (32 bytes hex)
      const pubRaw = publicKey.export({ type: "spki", format: "der" });
      // Ed25519 SPKI DER: the last 32 bytes are the public key
      const pubBytes = (pubRaw as Buffer).subarray(-32);
      const publicHexPath = join(tempDir, "public.hex");
      writeFileSync(publicHexPath, pubBytes.toString("hex"), "utf-8");

      const passport = createMinimalPassport();
      const passportPath = join(tempDir, "passport.json");
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), "utf-8");

      // Sign with hex private key
      const jwt = signPassport({
        artifactPath: passportPath,
        keyPath: privateHexPath,
      });

      expect(jwt.split(".")).toHaveLength(3);

      // Verify with hex public key
      const result = verifySignedPassport({
        jwtString: jwt,
        publicKeyPath: publicHexPath,
      });

      expect(result.valid).toBe(true);
      expect(result.signatureValid).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("invalid passport structure is detected during verification", () => {
    tempDir = createTempDir();
    try {
      const { privateKeyPath, publicKeyPath } = writeKeyPairFiles(tempDir);

      // Create an invalid passport (missing required fields)
      const invalidPassport = {
        passport_version: "0.1",
        identity: { passport_id: "test" },
        // missing: validity, revocation, attestation
      };
      const passportPath = join(tempDir, "passport-invalid.json");
      writeFileSync(passportPath, JSON.stringify(invalidPassport, null, 2), "utf-8");

      const jwt = signPassport({
        artifactPath: passportPath,
        keyPath: privateKeyPath,
      });

      const result = verifySignedPassport({
        jwtString: jwt,
        publicKeyPath,
      });

      expect(result.valid).toBe(false);
      expect(result.structureValid).toBe(false);
      expect(result.structureErrors.length).toBeGreaterThan(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("full generate → sign → verify → revoke flow", () => {
    tempDir = createTempDir();
    try {
      const { privateKeyPath, publicKeyPath } = writeKeyPairFiles(tempDir);

      // generate → create a minimal valid Trust Passport
      const passport = createMinimalPassport();
      const passportPath = join(tempDir, "passport.json");
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), "utf-8");

      // sign → produce a signed JWT
      const jwt = signPassport({ artifactPath: passportPath, keyPath: privateKeyPath });
      expect(jwt.split(".")).toHaveLength(3);

      // verify → the signed passport is valid and not revoked
      const verified = verifySignedPassport({ jwtString: jwt, publicKeyPath });
      expect(verified.valid).toBe(true);
      expect(verified.revoked).toBe(false);
      expect(verified.signatureValid).toBe(true);

      // revoke → mark the passport as revoked
      const revokedPassport = revokePassport(passport, { reason: "critical_security_finding" });
      const revokedField = revokedPassport.revocation as Record<string, unknown>;
      expect(revokedField.revoked).toBe(true);
      expect(revokedField.revocation_reason).toBe("critical_security_finding");
      expect(typeof revokedField.revoked_at).toBe("string");
      // pre-existing revocation metadata is preserved
      expect(revokedField.revocation_triggers).toEqual(["critical_security_finding"]);
      const revokedPath = join(tempDir, "passport-revoked.json");
      writeFileSync(revokedPath, JSON.stringify(revokedPassport, null, 2), "utf-8");

      // re-sign the revoked passport
      const revokedJwt = signPassport({ artifactPath: revokedPath, keyPath: privateKeyPath });
      expect(revokedJwt.split(".")).toHaveLength(3);

      // verify → revoked passports are rejected even with a valid signature
      const revokedResult = verifySignedPassport({ jwtString: revokedJwt, publicKeyPath });
      expect(revokedResult.valid).toBe(false);
      expect(revokedResult.revoked).toBe(true);
      expect(revokedResult.signatureValid).toBe(true);
      expect(revokedResult.expired).toBe(false);
      expect(revokedResult.errors.some((e) => e.toLowerCase().includes("revoked"))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("passport revoke CLI command marks a passport file as revoked", () => {
    tempDir = createTempDir();
    try {
      const passport = createMinimalPassport();
      const passportPath = join(tempDir, "passport.json");
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), "utf-8");

      // revoke via the CLI command helper (writes back to source by default)
      const dest = revokePassportFile({ passportPath, reason: "key_compromise" });
      expect(dest).toBe(passportPath);

      const after = JSON.parse(readFileSync(passportPath, "utf-8")) as Record<string, unknown>;
      const revocation = after.revocation as Record<string, unknown>;
      expect(revocation.revoked).toBe(true);
      expect(revocation.revocation_reason).toBe("key_compromise");
      expect(typeof revocation.revoked_at).toBe("string");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
