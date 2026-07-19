import { describe, expect, spyOn, test } from 'bun:test';
/**
 * Tests for sigstore-verify module.
 *
 * Covers: Sigstore bundle parsing, signature verification, offline mode,
 * FIPS-compliant algorithm enforcement, and enterprise SSO issuer checks.
 *
 * Uses openssl to generate self-signed test certificates with configurable SANs.
 */
import { execSync } from 'node:child_process';
import { createHash, createSign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './index.js';
import { verifySigstoreBundle, verifySigstoreCommand } from './sigstore-verify.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_PASSPORT = {
  passport_version: '0.1',
  identity: {
    passport_id: 'test-passport-sigstore-001',
    agent_id: 'test-agent-001',
    agent_name: 'Test Agent',
    issuer: 'sigstore-test',
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
    issuer: 'sigstore-test',
  },
};

interface TestArtifacts {
  tempDir: string;
  bundlePath: string;
  artifactPath: string;
  certPem: string;
  keyPem: string;
}

/**
 * Generate a self-signed RSA certificate via openssl, sign the given artifact,
 * and assemble a valid Sigstore bundle (v0.3).
 */
function createTestBundle(
  artifactJson: Record<string, unknown>,
  options?: {
    sanDns?: string;
    sanUri?: string;
    tlogEntries?: Array<{ logIndex: number; integratedTime: number }>;
    useSha384?: boolean;
  },
): TestArtifacts {
  const tempDir = mkdtempSync(join(tmpdir(), 'sigstore-test-'));

  const artifactStr = JSON.stringify(artifactJson, null, 2);
  const artifactBuf = Buffer.from(artifactStr, 'utf-8');
  const artifactPath = join(tempDir, 'artifact.json');
  writeFileSync(artifactPath, artifactStr, 'utf-8');

  const certPath = join(tempDir, 'cert.pem');
  const keyPath = join(tempDir, 'key.pem');

  const sanParts: string[] = [];
  if (options?.sanDns) sanParts.push(`DNS:${options.sanDns}`);
  if (options?.sanUri) sanParts.push(`URI:${options.sanUri}`);
  const sanArg = sanParts.length > 0 ? ` -addext "subjectAltName=${sanParts.join(',')}"` : '';

  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -nodes -days 365 -subj "/CN=Test Cert"${sanArg}`,
    { stdio: 'pipe' },
  );

  const certPem = readFileSync(certPath, 'utf-8');
  const keyPem = readFileSync(keyPath, 'utf-8');

  // Sign the artifact with RSA
  const hashAlg = options?.useSha384 ? 'RSA-SHA384' : 'RSA-SHA256';
  const hashName = options?.useSha384 ? 'sha384' : 'sha256';
  const signer = createSign(hashAlg);
  signer.update(artifactBuf);
  const signature = signer.sign(keyPem);

  // Compute message digest
  const digest = createHash(hashName).update(artifactBuf).digest('base64');

  // Convert PEM cert to raw DER base64 for bundle
  const certDerB64 = certPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

  const bundle = {
    mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.3',
    content: {
      $case: 'MessageSignature',
      messageDigest: {
        algorithm: options?.useSha384 ? 'SHA384' : 'SHA256',
        digest,
      },
      signature: signature.toString('base64'),
    },
    verificationMaterial: {
      content: {
        $case: 'x509CertificateChain',
        certificates: [{ rawBytes: certDerB64 }],
      },
      ...(options?.tlogEntries ? { tlogEntries: options.tlogEntries } : {}),
    },
  };

  const bundlePath = join(tempDir, 'bundle.json');
  writeFileSync(bundlePath, JSON.stringify(bundle), 'utf-8');

  return { tempDir, bundlePath, artifactPath, certPem, keyPem };
}

function cleanup(t: TestArtifacts): void {
  rmSync(t.tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sigstore bundle verification', () => {
  test('full verification passes for valid bundle + artifact', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
      });
      expect(result.certificateValid).toBe(true);
      expect(result.signatureValid).toBe(true);
      expect(result.artifactValid).toBe(true);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    } finally {
      cleanup(t);
    }
  });

  test('bundle without artifact: cert valid, signature skipped', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const result = verifySigstoreBundle({ bundlePath: t.bundlePath });
      expect(result.certificateValid).toBe(true);
      expect(result.signatureValid).toBe(false);
      expect(result.valid).toBe(true); // no errors since sig not checked
      expect(result.warnings.some((w) => w.includes('signature verification skipped'))).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  // ---- Signature verification ----

  test('detects tampered artifact (digest mismatch)', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const artifact = JSON.parse(readFileSync(t.artifactPath, 'utf-8'));
      artifact.identity.agent_name = 'TAMPERED AGENT';
      writeFileSync(t.artifactPath, JSON.stringify(artifact), 'utf-8');

      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
      });
      expect(result.signatureValid).toBe(false);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('digest mismatch'))).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  // ---- Artifact validation ----

  test('detects invalid artifact structure', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      // Replace artifact with minimal invalid object
      writeFileSync(t.artifactPath, JSON.stringify({ passport_version: '0.1' }), 'utf-8');

      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
      });
      expect(result.artifactValid).toBe(false);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.startsWith('Artifact:'))).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  test('artifact provided via artifactContent buffer', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const artifactBuf = readFileSync(t.artifactPath);
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactContent: artifactBuf,
      });
      expect(result.signatureValid).toBe(true);
      expect(result.artifactValid).toBe(true);
      expect(result.valid).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  // ---- Bundle parsing errors ----

  test('invalid bundle format returns errors', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'sigstore-bad-'));
    try {
      const badPath = join(tempDir, 'bad.json');
      writeFileSync(badPath, '{"not": "a bundle"}', 'utf-8');

      const result = verifySigstoreBundle({ bundlePath: badPath });
      expect(result.valid).toBe(false);
      expect(result.certificateValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('non-existent bundle path returns error', () => {
    const result = verifySigstoreBundle({ bundlePath: '/nonexistent/bundle.json' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Bundle load error'))).toBe(true);
  });

  test('missing bundle path returns error', () => {
    const result = verifySigstoreBundle({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No bundle input provided (bundlePath required)');
  });

  test('bundle with empty certificates array returns error', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'sigstore-nocerts-'));
    try {
      const bundlePath = join(tempDir, 'bundle.json');
      writeFileSync(
        bundlePath,
        JSON.stringify({
          mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.3',
          content: { $case: 'MessageSignature', signature: 'AAAA' },
          verificationMaterial: { content: { $case: 'x509CertificateChain', certificates: [] } },
        }),
        'utf-8',
      );
      const result = verifySigstoreBundle({ bundlePath });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('non-empty array'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Offline mode (air-gapped installation)
// ---------------------------------------------------------------------------

describe('Sigstore offline mode (air-gapped)', () => {
  test('offline mode skips tlog verification with warning', () => {
    const t = createTestBundle(MINIMAL_PASSPORT, {
      tlogEntries: [{ logIndex: 12345, integratedTime: 1700000000 }],
    });
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        offline: true,
      });
      expect(result.tlogVerified).toBe(false);
      expect(result.valid).toBe(true); // still passes without tlog
      expect(result.warnings.some((w) => w.includes('Rekor check skipped'))).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  test('offline mode: no tlog entries produces no offline warning', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        offline: true,
      });
      // No tlog entries → no "skipped" warning (nothing to skip)
      expect(result.warnings.some((w) => w.includes('Rekor check skipped'))).toBe(false);
    } finally {
      cleanup(t);
    }
  });

  test('online mode with tlog entries warns about missing @sigstore/client', () => {
    const t = createTestBundle(MINIMAL_PASSPORT, {
      tlogEntries: [{ logIndex: 12345, integratedTime: 1700000000 }],
    });
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        offline: false,
      });
      expect(result.tlogVerified).toBe(false);
      expect(result.warnings.some((w) => w.includes('@sigstore/client'))).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  test('online mode without tlog entries warns about absence', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        offline: false,
      });
      expect(result.warnings.some((w) => w.includes('No transparency log entries'))).toBe(true);
    } finally {
      cleanup(t);
    }
  });
});

// ---------------------------------------------------------------------------
// FIPS-compliant crypto backends
// ---------------------------------------------------------------------------

describe('FIPS-compliant crypto enforcement', () => {
  test('FIPS mode passes for SHA-256 with RSA', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        fips: true,
      });
      expect(result.fipsCompliant).toBe(true);
      expect(result.valid).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  test('FIPS mode passes for SHA-384 with RSA', () => {
    const t = createTestBundle(MINIMAL_PASSPORT, { useSha384: true });
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        fips: true,
      });
      expect(result.fipsCompliant).toBe(true);
      expect(result.valid).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  test('FIPS mode rejects MD5 digest algorithm', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      // Tamper with the bundle to change digest algorithm to MD5
      const bundleRaw = readFileSync(t.bundlePath, 'utf-8');
      const bundle = JSON.parse(bundleRaw);
      bundle.content.messageDigest.algorithm = 'MD5';
      writeFileSync(t.bundlePath, JSON.stringify(bundle), 'utf-8');

      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        fips: true,
      });
      expect(result.fipsCompliant).toBe(false);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unapproved hash'))).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  test('FIPS mode rejects MD5 digest (lowercase)', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const bundleRaw = readFileSync(t.bundlePath, 'utf-8');
      const bundle = JSON.parse(bundleRaw);
      bundle.content.messageDigest.algorithm = 'md5';
      writeFileSync(t.bundlePath, JSON.stringify(bundle), 'utf-8');

      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        fips: true,
      });
      expect(result.fipsCompliant).toBe(false);
      expect(result.valid).toBe(false);
    } finally {
      cleanup(t);
    }
  });

  test('non-FIPS mode does not enforce algorithm restrictions', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const bundleRaw = readFileSync(t.bundlePath, 'utf-8');
      const bundle = JSON.parse(bundleRaw);
      bundle.content.messageDigest.algorithm = 'MD5';
      writeFileSync(t.bundlePath, JSON.stringify(bundle), 'utf-8');

      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        fips: false,
      });
      // FIPS not enforced, so fipsCompliant stays true (not checked)
      expect(result.fipsCompliant).toBe(true);
      // But digest comparison will fail because MD5 won't match SHA-256
      // Actually digest mismatch will trigger, making it invalid
      expect(result.signatureValid).toBe(false); // digest mismatch
    } finally {
      cleanup(t);
    }
  });
});

// ---------------------------------------------------------------------------
// Enterprise SSO integration (OIDC issuer verification)
// ---------------------------------------------------------------------------

describe('Enterprise SSO issuer verification', () => {
  test('SSO issuer match when cert has matching URI SAN', () => {
    const t = createTestBundle(MINIMAL_PASSPORT, {
      sanUri: 'https://accounts.example.com',
    });
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        trustedIssuer: 'https://accounts.example.com',
      });
      expect(result.issuerMatch).toBe(true);
      expect(result.valid).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  test('SSO issuer mismatch with different URI', () => {
    const t = createTestBundle(MINIMAL_PASSPORT, {
      sanUri: 'https://accounts.other.com',
    });
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        trustedIssuer: 'https://accounts.example.com',
      });
      expect(result.issuerMatch).toBe(false);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('issuer mismatch'))).toBe(true);
    } finally {
      cleanup(t);
    }
  });

  test('SSO issuer check fails when cert has no SANs', () => {
    const t = createTestBundle(MINIMAL_PASSPORT); // No SANs configured
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        trustedIssuer: 'https://accounts.example.com',
      });
      expect(result.issuerMatch).toBe(false);
      expect(result.valid).toBe(false);
    } finally {
      cleanup(t);
    }
  });

  test('no issuer specified skips SSO check', () => {
    const t = createTestBundle(MINIMAL_PASSPORT, {
      sanUri: 'https://accounts.example.com',
    });
    try {
      const result = verifySigstoreBundle({
        bundlePath: t.bundlePath,
        artifactPath: t.artifactPath,
        // trustedIssuer not specified
      });
      expect(result.issuerMatch).toBe(true); // default
      expect(result.valid).toBe(true);
    } finally {
      cleanup(t);
    }
  });
});

// ---------------------------------------------------------------------------
// CLI command tests
// ---------------------------------------------------------------------------

describe('verify-sigstore CLI command', () => {
  test('--help displays usage with all flags', () => {
    const spy = spyOn(console, 'log');
    try {
      expect(verifySigstoreCommand(['--help'])).toBe(0);
      const helpCall = spy.mock.calls.find((c) => (c[0] as string).includes('--offline'));
      expect(helpCall).toBeDefined();
      const output = helpCall?.[0] as string;
      expect(output).toContain('--offline');
      expect(output).toContain('--fips');
      expect(output).toContain('--issuer');
      expect(output).toContain('--artifact');
    } finally {
      spy.mockRestore();
    }
  });

  test('-h displays usage', () => {
    const spy = spyOn(console, 'log');
    try {
      expect(verifySigstoreCommand(['-h'])).toBe(0);
      const helpCall = spy.mock.calls.find((c) => (c[0] as string).includes('verify-sigstore'));
      expect(helpCall).toBeDefined();
      expect(helpCall?.[0]).toContain('verify-sigstore');
    } finally {
      spy.mockRestore();
    }
  });

  test('no arguments prints error', () => {
    const spy = spyOn(console, 'error');
    try {
      expect(verifySigstoreCommand([])).toBe(1);
      const errCall = spy.mock.calls.find((c) => (c[0] as string).includes('requires'));
      expect(errCall).toBeDefined();
      expect(errCall?.[0]).toContain('requires a <bundle.json>');
    } finally {
      spy.mockRestore();
    }
  });

  test('valid bundle + artifact returns 0', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const spy = spyOn(console, 'log');
      expect(verifySigstoreCommand([t.bundlePath, '--artifact', t.artifactPath])).toBe(0);
      const jsonCall = spy.mock.calls.find((c) => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall?.[0] as string);
      expect(output.valid).toBe(true);
    } finally {
      spyOn(console, 'log').mockRestore();
      cleanup(t);
    }
  });

  test('--offline flag accepted', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const spy = spyOn(console, 'log');
      expect(verifySigstoreCommand([t.bundlePath, '--artifact', t.artifactPath, '--offline'])).toBe(
        0,
      );
      const jsonCall = spy.mock.calls.find((c) => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      expect(JSON.parse(jsonCall?.[0] as string).valid).toBe(true);
    } finally {
      spyOn(console, 'log').mockRestore();
      cleanup(t);
    }
  });

  test('--fips flag accepted', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const spy = spyOn(console, 'log');
      expect(verifySigstoreCommand([t.bundlePath, '--artifact', t.artifactPath, '--fips'])).toBe(0);
      const jsonCall = spy.mock.calls.find((c) => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      expect(JSON.parse(jsonCall?.[0] as string).valid).toBe(true);
    } finally {
      spyOn(console, 'log').mockRestore();
      cleanup(t);
    }
  });

  test('--issuer flag accepted', () => {
    const t = createTestBundle(MINIMAL_PASSPORT, {
      sanUri: 'https://accounts.example.com',
    });
    try {
      const spy = spyOn(console, 'log');
      expect(
        verifySigstoreCommand([
          t.bundlePath,
          '--artifact',
          t.artifactPath,
          '--issuer',
          'https://accounts.example.com',
        ]),
      ).toBe(0);
      const jsonCall = spy.mock.calls.find((c) => {
        try {
          JSON.parse(c[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      expect(JSON.parse(jsonCall?.[0] as string).valid).toBe(true);
    } finally {
      spyOn(console, 'log').mockRestore();
      cleanup(t);
    }
  });

  test('tampered artifact returns 1', () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const artifact = JSON.parse(readFileSync(t.artifactPath, 'utf-8'));
      artifact.identity.agent_name = 'TAMPERED';
      writeFileSync(t.artifactPath, JSON.stringify(artifact), 'utf-8');

      expect(verifySigstoreCommand([t.bundlePath, '--artifact', t.artifactPath])).toBe(1);
    } finally {
      cleanup(t);
    }
  });

  test('unexpected argument prints error', () => {
    const spy = spyOn(console, 'error');
    try {
      expect(verifySigstoreCommand(['bundle.json', 'bogusarg'])).toBe(1);
      const errCall = spy.mock.calls.find((c) => (c[0] as string).includes('unexpected'));
      expect(errCall).toBeDefined();
      expect(errCall?.[0]).toContain('unexpected argument');
    } finally {
      spy.mockRestore();
    }
  });

  test('dispatches through index.ts runCommand', async () => {
    const t = createTestBundle(MINIMAL_PASSPORT);
    try {
      const result = runCommand([
        'passport',
        'verify-sigstore',
        t.bundlePath,
        '--artifact',
        t.artifactPath,
      ]);
      const code = typeof result === 'number' ? result : await result;
      expect(code).toBe(0);
    } finally {
      cleanup(t);
    }
  });
});
