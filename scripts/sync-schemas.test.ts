import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateContract, fingerprint, runSyncSchemasGate } from './sync-schemas.mjs';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const agentbomContract = { name: 'agentbom', localPath: 'specs/agentbom/schema.json' };

describe('sync-schemas fingerprint', () => {
  it('ignores $id and $schema so the namespace migration does not read as drift', () => {
    const base = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'https://github.com/WasmAgent/agent-trust-infra/specs/agentbom/schema.json',
      title: 'AgentBOM',
      type: 'object',
      properties: { agentbom_version: { type: 'string' } },
    };
    const canonicalId = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://wasmagent.dev/schemas/agentbom/v0.1.schema.json',
      title: 'AgentBOM',
      type: 'object',
      properties: { agentbom_version: { type: 'string' } },
    };
    expect(fingerprint(base)).toEqual(fingerprint(canonicalId));
  });

  it('detects structural drift in the schema body', () => {
    const a = { properties: { x: { type: 'string' } } };
    const b = { properties: { x: { type: 'integer' } } };
    expect(fingerprint(a)).not.toEqual(fingerprint(b));
  });
});

describe('sync-schemas evaluateContract', () => {
  const local = JSON.parse(
    readFileSync(resolve(repoRoot, 'specs/agentbom/schema.json'), 'utf-8'),
  );

  it('returns PENDING when the upstream package has not published the schema', () => {
    expect(evaluateContract(agentbomContract, undefined)).toBe('PENDING');
  });

  it('returns OK when the canonical body matches the local vendored copy', () => {
    expect(evaluateContract(agentbomContract, local)).toBe('OK');
  });

  it('returns DRIFT when the canonical body differs from the local copy', () => {
    const drifted = JSON.parse(JSON.stringify(local));
    drifted.title = 'AgentBOM (mutated)';
    expect(evaluateContract(agentbomContract, drifted)).toBe('DRIFT');
  });
});

describe('sync-schemas gate (live state)', () => {
  it('passes today because @wasmagent/protocol has not registered agentbom/mcp-posture yet', () => {
    const { exitCode, lines } = runSyncSchemasGate();
    expect(exitCode).toBe(0);
    expect(lines.some((l) => l.includes('PENDING') && l.includes('agentbom'))).toBe(true);
    expect(lines.some((l) => l.includes('PENDING') && l.includes('mcp-posture'))).toBe(true);
    expect(lines.some((l) => l.startsWith('PASS'))).toBe(true);
  });
});
