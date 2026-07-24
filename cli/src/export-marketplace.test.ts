/**
 * Tests for marketplace trust package export.
 */
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MARKETPLACE_PACKAGE_SCHEMA,
  type MarketplacePackage,
  buildMarketplacePackage,
  exportMarketplaceCommand,
} from './export-marketplace.js';

const tmpPaths: string[] = [];

function tmpFile(suffix = '.json'): string {
  const p = join(
    '/tmp',
    `test-bom-marketplace-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`,
  );
  tmpPaths.push(p);
  return p;
}

function tmpDirPath(): string {
  const p = join(
    '/tmp',
    `test-bom-marketplace-out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  tmpPaths.push(p);
  return p;
}

describe('buildMarketplacePackage', () => {
  it('returns a valid package with defaults for an empty BOM', () => {
    const pkg = buildMarketplacePackage({}, 'sha256:000');

    expect(pkg.schema).toBe(MARKETPLACE_PACKAGE_SCHEMA);
    expect(pkg.cas_id).toBe('sha256:000');
    expect(pkg.agent_id).toBe('unknown');
    expect(pkg.agent_name).toBe('unknown');
    expect(pkg.agent_version).toBe('unknown');
    expect(pkg.publisher).toBe('unknown');
    expect(pkg.capabilities).toEqual([]);
    expect(pkg.compliance_summary.frameworks).toEqual([]);
    expect(pkg.compliance_summary.passed_checks).toBe(0);
    expect(pkg.compliance_summary.total_checks).toBe(0);
    expect(pkg.trust_attestations).toEqual([]);
    expect(pkg.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(pkg.verification_instructions).toContain('trust-cli compliance-check');
  });

  it('extracts identity, capabilities, and compliance from a full BOM', () => {
    const bom: Record<string, unknown> = {
      agent_id: 'agent-42',
      agent_name: 'My Agent',
      agent_version: '2.0.0',
      capabilities: { declared: ['tool_use', 'code_gen'] },
      compliance_mappings: [
        { framework_id: 'owasp-top10', status: 'pass' },
        { framework_id: 'eu-ai-act', status: 'pass' },
      ],
      maintainer: 'Acme Corp',
    };

    const pkg = buildMarketplacePackage(bom, 'sha256:full');

    expect(pkg.agent_id).toBe('agent-42');
    expect(pkg.agent_name).toBe('My Agent');
    expect(pkg.agent_version).toBe('2.0.0');
    expect(pkg.capabilities).toEqual(['tool_use', 'code_gen']);
    expect(pkg.compliance_summary.frameworks).toEqual(['owasp-top10', 'eu-ai-act']);
    expect(pkg.publisher).toBe('Acme Corp');
  });

  it('passes through the cas_id value verbatim', () => {
    const pkg = buildMarketplacePackage({}, 'sha256:abc');
    expect(pkg.cas_id).toBe('sha256:abc');
  });
});

describe('exportMarketplaceCommand', () => {
  it('returns 0 and prints help when called with no arguments', () => {
    const spy = spyOn(console, 'log');
    const code = exportMarketplaceCommand([]);

    expect(code).toBe(0);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Usage:');
    expect(output).toContain('export-marketplace');
    expect(output).toContain('--output');
  });

  it('writes a marketplace-package.json with the correct schema for a valid BOM', () => {
    const bomPath = tmpFile();
    const outDir = tmpDirPath();
    const bom = { agent_id: 'test-agent', agent_name: 'Test' };
    writeFileSync(bomPath, JSON.stringify(bom), 'utf-8');

    const code = exportMarketplaceCommand([bomPath, '--output', outDir]);

    expect(code).toBe(0);
    const outFile = join(outDir, 'marketplace-package.json');
    const parsed = JSON.parse(readFileSync(outFile, 'utf-8')) as MarketplacePackage;
    expect(parsed.schema).toBe(MARKETPLACE_PACKAGE_SCHEMA);
    expect(parsed.agent_id).toBe('test-agent');
    expect(parsed.agent_name).toBe('Test');
  });

  it('places the output file in the directory specified by --output', () => {
    const bomPath = tmpFile();
    const outDir = tmpDirPath();
    writeFileSync(bomPath, '{}', 'utf-8');

    const code = exportMarketplaceCommand([bomPath, '--output', outDir]);

    expect(code).toBe(0);
    const expectedFile = join(outDir, 'marketplace-package.json');
    const content = readFileSync(expectedFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.schema).toBe(MARKETPLACE_PACKAGE_SCHEMA);
  });

  it('returns 1 when given a file with invalid JSON', () => {
    const bomPath = tmpFile();
    const outDir = tmpDirPath();
    writeFileSync(bomPath, 'not valid json{{{', 'utf-8');

    const spy = spyOn(console, 'error');
    const code = exportMarketplaceCommand([bomPath, '--output', outDir]);

    expect(code).toBe(1);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Error');
  });

  afterEach(() => {
    for (const p of tmpPaths.splice(0)) {
      rmSync(p, { recursive: true, force: true });
    }
  });
});
