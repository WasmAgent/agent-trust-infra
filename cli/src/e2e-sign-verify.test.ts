/**
 * E2E test: generate keypair → sign passport → verify → test expiry (revocation proxy).
 *
 * Tests the full flow: key generation, passport signing, verification,
 * and failure cases (expired passport, wrong key).
 */
import { describe, expect, test } from 'bun:test';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signPassport } from './passport-sign.js';
import { verifySignedPassport } from './passport-verify-signed.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'trust-e2e-'));
}

function createMinimalPassport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    passport_version: '0.1',
    identity: {
      passport_id: 'test-passport-001',
      agent_id: 'test-agent-001',
      agent_name: 'Test Agent',
      issuer: 'e2e-test',
      issuance_context: 'self-issued',
    },
    validity: {
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    },
    revocation: {
      revoked: false,
      revocation_triggers: ['critical_security_finding'],
    },
    attestation: {
      issuer: 'e2e-test',
    },
    ...overrides,
  };
}

function writeKeyPairFiles(tempDir: string): { privateKeyPath: string; publicKeyPath: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');

  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  const privateKeyPath = join(tempDir, 'private.pem');
  const publicKeyPath = join(tempDir, 'public.pem');

  writeFileSync(privateKeyPath, privateKeyPem, 'utf-8');
  writeFileSync(publicKeyPath, publicKeyPem, 'utf-8');

  return { privateKeyPath, publicKeyPath };
}

describe('E2E: sign → verify flow', () => {
  let tempDir: string;

  test('full flow: generate keypair, sign passport, verify signature', async () => {
    tempDir = createTempDir();
    try {
      // Step 1: Generate Ed25519 keypair
      const { privateKeyPath, publicKeyPath } = writeKeyPairFiles(tempDir);

      // Step 2: Create a minimal valid Trust Passport
      const passport = createMinimalPassport();
      const passportPath = join(tempDir, 'passport.json');
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), 'utf-8');

      // Step 3: Sign the passport
      const jwt = await signPassport({
        artifactPath: passportPath,
        keyPath: privateKeyPath,
      });

      expect(jwt).toBeTruthy();
      expect(jwt.split('.')).toHaveLength(3);

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
      expect((result.payload as Record<string, unknown>).passport_version).toBe('0.1');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('sign adds default expiry when not present', async () => {
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
      const passportPath = join(tempDir, 'passport-no-expiry.json');
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), 'utf-8');

      const jwt = await signPassport({
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

  test('sign with custom --expires duration', async () => {
    tempDir = createTempDir();
    try {
      const { privateKeyPath, publicKeyPath } = writeKeyPairFiles(tempDir);

      const passport = createMinimalPassport({
        validity: {
          issued_at: new Date().toISOString(),
        },
      });
      const passportPath = join(tempDir, 'passport-custom-expiry.json');
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), 'utf-8');

      const jwt = await signPassport({
        artifactPath: passportPath,
        keyPath: privateKeyPath,
        expires: '90d',
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

  test('verify fails with wrong public key', async () => {
    tempDir = createTempDir();
    try {
      const { privateKeyPath } = writeKeyPairFiles(tempDir);

      // Generate a different keypair for verification
      const wrongKeyPair = generateKeyPairSync('ed25519');
      const wrongPubPem = wrongKeyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
      const wrongPubPath = join(tempDir, 'wrong-public.pem');
      writeFileSync(wrongPubPath, wrongPubPem, 'utf-8');

      const passport = createMinimalPassport();
      const passportPath = join(tempDir, 'passport.json');
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), 'utf-8');

      const jwt = await signPassport({
        artifactPath: passportPath,
        keyPath: privateKeyPath,
      });

      const result = verifySignedPassport({
        jwtString: jwt,
        publicKeyPath: wrongPubPath,
      });

      expect(result.valid).toBe(false);
      expect(result.signatureValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Signature verification failed'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('verify fails for expired passport (revocation proxy)', async () => {
    tempDir = createTempDir();
    try {
      const { privateKeyPath, publicKeyPath } = writeKeyPairFiles(tempDir);

      // Create a passport that is already expired
      const passport = createMinimalPassport({
        validity: {
          issued_at: '2020-01-01T00:00:00Z',
          expires_at: '2020-06-01T00:00:00Z', // expired in the past
        },
      });
      const passportPath = join(tempDir, 'passport-expired.json');
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), 'utf-8');

      const jwt = await signPassport({
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
      expect(result.errors.some((e) => e.includes('expired'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('verify fails for malformed JWT', async () => {
    const result = verifySignedPassport({
      jwtString: 'not.a.valid-jwt',
    });

    // No public key provided, so signature cannot be verified
    expect(result.valid).toBe(false);
  });

  test('verify with hex key format', async () => {
    tempDir = createTempDir();
    try {
      // Generate keypair
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');

      // Export private key as raw seed (32 bytes hex)
      const privRaw = privateKey.export({ type: 'pkcs8', format: 'der' });
      // Ed25519 PKCS#8 DER: the last 32 bytes are the seed
      const seed = (privRaw as Buffer).subarray(-32);
      const privateHexPath = join(tempDir, 'private.hex');
      writeFileSync(privateHexPath, seed.toString('hex'), 'utf-8');

      // Export public key as raw (32 bytes hex)
      const pubRaw = publicKey.export({ type: 'spki', format: 'der' });
      // Ed25519 SPKI DER: the last 32 bytes are the public key
      const pubBytes = (pubRaw as Buffer).subarray(-32);
      const publicHexPath = join(tempDir, 'public.hex');
      writeFileSync(publicHexPath, pubBytes.toString('hex'), 'utf-8');

      const passport = createMinimalPassport();
      const passportPath = join(tempDir, 'passport.json');
      writeFileSync(passportPath, JSON.stringify(passport, null, 2), 'utf-8');

      // Sign with hex private key
      const jwt = await signPassport({
        artifactPath: passportPath,
        keyPath: privateHexPath,
      });

      expect(jwt.split('.')).toHaveLength(3);

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

  test('sign rejects invalid passport structure', async () => {
    tempDir = createTempDir();
    try {
      const { privateKeyPath } = writeKeyPairFiles(tempDir);

      // Create an invalid passport (missing required fields)
      const invalidPassport = {
        passport_version: '0.1',
        identity: { passport_id: 'test' },
        // missing: validity, revocation, attestation
      };
      const passportPath = join(tempDir, 'passport-invalid.json');
      writeFileSync(passportPath, JSON.stringify(invalidPassport, null, 2), 'utf-8');

      await expect(
        signPassport({
          artifactPath: passportPath,
          keyPath: privateKeyPath,
        }),
      ).rejects.toThrow('Invalid passport format');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('verify detects invalid passport structure in JWT payload', () => {
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), 'utf-8').toString(
      'base64url',
    );
    const payloadB64 = Buffer.from(
      JSON.stringify({
        passport_version: '0.1',
        identity: { passport_id: 'test' },
      }),
      'utf-8',
    ).toString('base64url');
    const jwt = `${headerB64}.${payloadB64}.invalid-signature`;

    const result = verifySignedPassport({ jwtString: jwt });

    expect(result.valid).toBe(false);
    expect(result.structureValid).toBe(false);
    expect(result.structureErrors.length).toBeGreaterThan(0);
  });

  test('verify rejects JWT payloads that are not JSON objects', () => {
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), 'utf-8').toString(
      'base64url',
    );
    const payloadB64 = Buffer.from(JSON.stringify(['not', 'a', 'passport']), 'utf-8').toString(
      'base64url',
    );
    const jwt = `${headerB64}.${payloadB64}.invalid-signature`;

    const result = verifySignedPassport({ jwtString: jwt });

    expect(result.valid).toBe(false);
    expect(result.structureValid).toBe(false);
    expect(result.errors).toContain('Failed to decode JWT payload');
  });
});
