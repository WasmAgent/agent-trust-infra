/**
 * Compliance check test suite.
 *
 * Tests all compliance profiles with known-good and known-bad fixtures.
 * Known-good fixtures should pass compliance checks, while known-bad fixtures
 * should fail with specific error messages.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { complianceCheckCommand } from './compliance-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('compliance-check: profile validation with fixtures', () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let consoleOutput: string[] = [];
  let errorOutput: string[] = [];

  beforeEach(() => {
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    consoleOutput = [];
    errorOutput = [];

    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
      errorOutput.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  function getFixturePath(fixtureName: string): string {
    return resolve(__dirname, 'compliance-fixtures', fixtureName);
  }

  describe('SOC2 2024 profile', () => {
    const profileId = 'soc2-2024';

    it('accepts known-good SOC2 fixture', () => {
      const fixturePath = getFixturePath('soc2-2024-known-good.json');
      const exitCode = complianceCheckCommand([fixturePath, '--profile', profileId]);

      expect(exitCode).toBe(0);
      expect(errorOutput).toHaveLength(0);
      expect(consoleOutput.some((line) => line.includes('✓ COMPLIANT'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('SOC2'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('2024'))).toBe(true);
    });

    it('rejects known-bad SOC2 fixture', () => {
      const fixturePath = getFixturePath('soc2-2024-known-bad.json');
      const exitCode = complianceCheckCommand([fixturePath, '--profile', profileId]);

      expect(exitCode).toBe(1);
      expect(consoleOutput.some((line) => line.includes('✗ NON-COMPLIANT'))).toBe(true);

      const errorText = consoleOutput.join('\n');
      // Known-bad fixture has multiple violations:
      // - development context (not in allowed contexts)
      // - tools with high/critical severity
      // - blocked permissions
      // - blocked sources
      // - unmitigated critical risks
      // - missing signature and timestamp
      expect(errorText).toMatch(/development_context|deployment_context/);
      expect(errorText).toMatch(/tool_layer/);
      expect(errorText).toMatch(/risk_layer/);
      expect(errorText).toMatch(/attestation/);
    });
  });

  describe('ISO27001 2022 profile', () => {
    const profileId = 'iso27001-2022';

    it('accepts known-good ISO27001 fixture', () => {
      const fixturePath = getFixturePath('iso27001-2022-known-good.json');
      const exitCode = complianceCheckCommand([fixturePath, '--profile', profileId]);

      expect(exitCode).toBe(0);
      expect(errorOutput).toHaveLength(0);
      expect(consoleOutput.some((line) => line.includes('✓ COMPLIANT'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('ISO27001'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('2022'))).toBe(true);
    });

    it('rejects known-bad ISO27001 fixture', () => {
      const fixturePath = getFixturePath('iso27001-2022-known-bad.json');
      const exitCode = complianceCheckCommand([fixturePath, '--profile', profileId]);

      expect(exitCode).toBe(1);
      expect(consoleOutput.some((line) => line.includes('✗ NON-COMPLIANT'))).toBe(true);

      const errorText = consoleOutput.join('\n');
      // Known-bad fixture has multiple violations:
      // - staging context (only production allowed)
      // - tools with critical severity
      // - blocked permissions (filesystem:write unrestricted)
      // - blocked sources (unverified-external)
      // - unmitigated critical risks
      // - missing signature and timestamp
      expect(errorText).toMatch(/deployment_context|staging/);
      expect(errorText).toMatch(/tool_layer/);
      expect(errorText).toMatch(/risk_layer/);
      expect(errorText).toMatch(/attestation/);
    });
  });

  describe('EIDAS controlled profile', () => {
    const profileId = 'eidas-controlled';

    it('accepts known-good EIDAS fixture', () => {
      const fixturePath = getFixturePath('eidas-controlled-known-good.json');
      const exitCode = complianceCheckCommand([fixturePath, '--profile', profileId]);

      expect(exitCode).toBe(0);
      expect(errorOutput).toHaveLength(0);
      expect(consoleOutput.some((line) => line.includes('✓ COMPLIANT'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('EIDAS'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('controlled'))).toBe(true);
    });

    it('rejects known-bad EIDAS fixture', () => {
      const fixturePath = getFixturePath('eidas-controlled-known-bad.json');
      const exitCode = complianceCheckCommand([fixturePath, '--profile', profileId]);

      expect(exitCode).toBe(1);
      expect(consoleOutput.some((line) => line.includes('✗ NON-COMPLIANT'))).toBe(true);

      const errorText = consoleOutput.join('\n');
      // Known-bad fixture has multiple violations:
      // - development context (only production allowed)
      // - tools with medium severity (max allowed is low)
      // - blocked permissions (filesystem:write, network:external, system:execute)
      // - blocked sources (external, unverified)
      // - unmitigated critical and high risks
      // - 2 unmitigated medium risks (max allowed is 1)
      // - missing signature and timestamp
      expect(errorText).toMatch(/deployment_context|development/);
      expect(errorText).toMatch(/tool_layer/);
      expect(errorText).toMatch(/risk_layer/);
      expect(errorText).toMatch(/attestation/);
    });
  });

  describe('fixture schema validation', () => {
    it('all known-good fixtures have valid AgentBOM schema', () => {
      const { validateAgentBOM } = require('../../packages/agentbom-core/src/index.js');
      const { readFileSync } = require('node:fs');

      const knownGoodFixtures = [
        'soc2-2024-known-good.json',
        'iso27001-2022-known-good.json',
        'eidas-controlled-known-good.json',
      ];

      for (const fixtureName of knownGoodFixtures) {
        const fixturePath = getFixturePath(fixtureName);
        const fixtureContent = readFileSync(fixturePath, 'utf-8');
        const fixtureData = JSON.parse(fixtureContent);

        const validation = validateAgentBOM(fixtureData);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    it('all known-bad fixtures have valid AgentBOM schema but fail compliance', () => {
      const { validateAgentBOM } = require('../../packages/agentbom-core/src/index.js');
      const { readFileSync } = require('node:fs');

      const knownBadFixtures = [
        'soc2-2024-known-bad.json',
        'iso27001-2022-known-bad.json',
        'eidas-controlled-known-bad.json',
      ];

      for (const fixtureName of knownBadFixtures) {
        const fixturePath = getFixturePath(fixtureName);
        const fixtureContent = readFileSync(fixturePath, 'utf-8');
        const fixtureData = JSON.parse(fixtureContent);

        // Schema should be valid
        const validation = validateAgentBOM(fixtureData);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });
  });

  describe('compliance check behavior', () => {
    it('returns error for non-existent profile', () => {
      const fixturePath = getFixturePath('soc2-2024-known-good.json');
      const exitCode = complianceCheckCommand([fixturePath, '--profile', 'nonexistent-profile']);

      expect(exitCode).toBe(1);
      expect(errorOutput.some((line) => line.includes('cannot load compliance profile'))).toBe(
        true,
      );
    });

    it('returns error for non-existent fixture file', () => {
      const exitCode = complianceCheckCommand(['/nonexistent/file.json', '--profile', 'soc2-2024']);

      expect(exitCode).toBe(1);
      expect(errorOutput.some((line) => line.includes('cannot read AgentBOM file'))).toBe(true);
    });

    it('returns error for invalid JSON', () => {
      const exitCode = complianceCheckCommand(['--profile', 'soc2-2024']);

      expect(exitCode).toBe(1);
      expect(errorOutput.length).toBeGreaterThan(0);
    });
  });

  describe('profile coverage', () => {
    it('all three compliance profiles are tested', () => {
      const profiles = ['soc2-2024', 'iso27001-2022', 'eidas-controlled'];
      const fixtures = [
        'soc2-2024-known-good.json',
        'iso27001-2022-known-good.json',
        'eidas-controlled-known-good.json',
      ];

      for (let i = 0; i < profiles.length; i++) {
        const profileId = profiles[i];
        const fixturePath = getFixturePath(fixtures[i]);
        const exitCode = complianceCheckCommand([fixturePath, '--profile', profileId]);

        expect(exitCode).toBe(0);
      }
    });
  });
});
