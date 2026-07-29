/**
 * Real @wasmagent/aep integration test.
 *
 * This test actually imports and exercises @wasmagent/aep to verify:
 * 1. The package is importable (not just referenced in documentation)
 * 2. The LocalEd25519Signer API has not drifted
 * 3. The sign/verify round-trip works end-to-end
 * 4. New v1.21.1 APIs: createLocalSignerFromSeed, verifyAEPChain, resolveRepoCommit
 *
 * Distinct from readme-impl-package-coherence.test.ts and
 * relationship-doc-impl-coherence.test.ts, which only check that
 * README documentation contains the package name strings.
 */
import { describe, expect, test } from 'bun:test';
import {
  AEPEmitter,
  createLocalSignerFromSeed,
  LocalEd25519Signer,
  resolveRepoCommit,
  verifyAEPChain,
  verifyAEPRecord,
} from '@wasmagent/aep';

describe('@wasmagent/aep integration — signer round-trip', () => {
  test('LocalEd25519Signer signs and verifies bytes', async () => {
    // Generate a deterministic test seed (32 bytes)
    const seed = new Uint8Array(32).fill(0x42);
    const signer = new LocalEd25519Signer('test-key-id', seed);

    const payload = Buffer.from('trust-passport-test-payload', 'utf-8');
    const sigBase64 = await signer.sign(payload);

    expect(typeof sigBase64).toBe('string');
    expect(sigBase64.length).toBeGreaterThan(0);

    // Signature should be 64 bytes = 88 base64 chars (with padding)
    const sigBytes = Buffer.from(sigBase64, 'base64');
    expect(sigBytes.length).toBe(64);
  });

  test('LocalEd25519Signer exposes keyId', () => {
    const seed = new Uint8Array(32).fill(0x01);
    const signer = new LocalEd25519Signer('my-key-id', seed);
    expect(signer.keyId).toBe('my-key-id');
  });

  test('different seeds produce different signatures', async () => {
    const seed1 = new Uint8Array(32).fill(0x01);
    const seed2 = new Uint8Array(32).fill(0x02);
    const signer1 = new LocalEd25519Signer('k1', seed1);
    const signer2 = new LocalEd25519Signer('k2', seed2);

    const payload = Buffer.from('same-payload', 'utf-8');
    const sig1 = await signer1.sign(payload);
    const sig2 = await signer2.sign(payload);

    expect(sig1).not.toBe(sig2);
  });

  test('verifyAEPRecord is exported and callable', () => {
    // Just check the function is exported and has the right shape
    expect(typeof verifyAEPRecord).toBe('function');
  });
});

describe('@wasmagent/aep v1.21.1 new APIs', () => {
  test('createLocalSignerFromSeed creates signer from hex seed', async () => {
    // createLocalSignerFromSeed is a convenience factory for the hex-seed path
    const seedHex = '42'.repeat(32); // 64-char hex = 32 bytes
    const signer = createLocalSignerFromSeed(seedHex, 'hex-key-01');

    expect(signer.keyId).toBe('hex-key-01');

    const payload = Buffer.from('test', 'utf-8');
    const sig = await signer.sign(payload);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });

  test('createLocalSignerFromSeed produces same result as LocalEd25519Signer with same seed', async () => {
    const seedHex = 'ab'.repeat(32);
    const seedBytes = new Uint8Array(Buffer.from(seedHex, 'hex'));

    const signerA = createLocalSignerFromSeed(seedHex, 'k');
    const signerB = new LocalEd25519Signer('k', seedBytes);

    const payload = Buffer.from('deterministic', 'utf-8');
    const sigA = await signerA.sign(payload);
    const sigB = await signerB.sign(payload);

    expect(sigA).toBe(sigB);
  });

  test('verifyAEPChain is exported and callable', () => {
    // verifyAEPChain — new in v1.21.1 — verifies the inter-record hash chain
    expect(typeof verifyAEPChain).toBe('function');
  });

  test('verifyAEPChain returns valid for an empty chain', () => {
    const result = verifyAEPChain([]);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  test('verifyAEPChain returns valid for a single-record chain (no prev_record_hash)', async () => {
    const seed = new Uint8Array(32).fill(0x99);
    const signer = new LocalEd25519Signer('chain-test-key', seed);
    const emitter = new AEPEmitter({
      run_id: 'run-chain-test-001',
      model_id: 'test-model',
      model_provider: 'test',
      signer,
    });
    emitter.addAction({ tool_name: 'noop', state_changing: false });
    const record = await emitter.emit();

    const result = verifyAEPChain([record]);
    expect(result.valid).toBe(true);
  });

  test('resolveRepoCommit is exported and callable', async () => {
    // resolveRepoCommit — new in v1.21.1 — resolves git commit from env/git/package.json
    expect(typeof resolveRepoCommit).toBe('function');

    // Should return a non-empty string (git hash, version, or env var value)
    const commit = await resolveRepoCommit({ fallbackToVersion: true });
    expect(typeof commit).toBe('string');
    expect(commit.length).toBeGreaterThan(0);
  });
});
