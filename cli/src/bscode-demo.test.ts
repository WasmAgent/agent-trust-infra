/**
 * bscode Agent Demo — End-to-end trust artifact chain validation tests.
 *
 * Validates that all three bscode-agent fixtures (agentbom.json, posture.json,
 * trust-passport.json) parse correctly, validate against their schemas, and
 * are internally consistent (shared agent_id, matching cross-references).
 */
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgentBOM } from '../../packages/agentbom-core/src/index.js';
import { validateMCPPosture } from '../../packages/mcp-posture-core/src/index.js';
import { validateTrustPassport } from '../../packages/trust-passport-core/src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEMO_DIR = resolve(__dirname, '../../examples/bscode-agent');

function loadJSON(name: string) {
  const raw = readFileSync(join(DEMO_DIR, name), 'utf-8');
  return JSON.parse(raw);
}

const AGENT_ID = 'bscode-agent-demo-001';
const SNAPSHOT_ID = 'posture-bscode-demo-001';
const PASSPORT_ID = 'passport-bscode-demo-001';

describe('bscode-agent demo fixtures', () => {
  describe('agentbom.json', () => {
    let data: unknown;

    it('parses as valid JSON', () => {
      data = loadJSON('agentbom.json');
      expect(data).toBeDefined();
    });

    it('validates against the AgentBOM v0.1 schema', () => {
      data = data ?? loadJSON('agentbom.json');
      const result = validateAgentBOM(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('has the expected agent_id', () => {
      data = data ?? loadJSON('agentbom.json');
      expect(data.identity.agent_id).toBe(AGENT_ID);
    });

    it('has version 0.1', () => {
      data = data ?? loadJSON('agentbom.json');
      expect(data.agentbom_version).toBe('0.1');
    });

    it('includes model_layer', () => {
      data = data ?? loadJSON('agentbom.json');
      expect(data.model_layer).toBeDefined();
      expect(data.model_layer.provider).toBe('anthropic');
      expect(data.model_layer.model_id).toBeDefined();
    });

    it('includes tool_layer with at least one tool', () => {
      data = data ?? loadJSON('agentbom.json');
      expect(Array.isArray(data.tool_layer)).toBe(true);
      expect(data.tool_layer.length).toBeGreaterThanOrEqual(1);
    });

    it('includes risk_layer', () => {
      data = data ?? loadJSON('agentbom.json');
      expect(Array.isArray(data.risk_layer)).toBe(true);
      expect(data.risk_layer.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('posture.json', () => {
    let data: unknown;

    it('parses as valid JSON', () => {
      data = loadJSON('posture.json');
      expect(data).toBeDefined();
    });

    it('validates against the MCP Posture v0.1 schema', () => {
      data = data ?? loadJSON('posture.json');
      const result = validateMCPPosture(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('has the expected agent_id', () => {
      data = data ?? loadJSON('posture.json');
      expect(data.identity.agent_id).toBe(AGENT_ID);
    });

    it('has the expected snapshot_id', () => {
      data = data ?? loadJSON('posture.json');
      expect(data.identity.snapshot_id).toBe(SNAPSHOT_ID);
    });

    it('has version 0.1', () => {
      data = data ?? loadJSON('posture.json');
      expect(data.posture_version).toBe('0.1');
    });

    it('includes at least one MCP server', () => {
      data = data ?? loadJSON('posture.json');
      expect(Array.isArray(data.servers)).toBe(true);
      expect(data.servers.length).toBeGreaterThanOrEqual(1);
    });

    it('includes risk_summary with at least one finding', () => {
      data = data ?? loadJSON('posture.json');
      expect(Array.isArray(data.risk_summary)).toBe(true);
      expect(data.risk_summary.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('trust-passport.json', () => {
    let data: unknown;

    it('parses as valid JSON', () => {
      data = loadJSON('trust-passport.json');
      expect(data).toBeDefined();
    });

    it('validates against the Trust Passport v0.1 schema', () => {
      data = data ?? loadJSON('trust-passport.json');
      const result = validateTrustPassport(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('has the expected agent_id', () => {
      data = data ?? loadJSON('trust-passport.json');
      expect(data.identity.agent_id).toBe(AGENT_ID);
    });

    it('has the expected passport_id', () => {
      data = data ?? loadJSON('trust-passport.json');
      expect(data.identity.passport_id).toBe(PASSPORT_ID);
    });

    it('has version 0.1', () => {
      data = data ?? loadJSON('trust-passport.json');
      expect(data.passport_version).toBe('0.1');
    });

    it('references the AgentBOM agent_id', () => {
      data = data ?? loadJSON('trust-passport.json');
      expect(data.agentbom_ref).toBeDefined();
      expect(data.agentbom_ref.agentbom_id).toBe(AGENT_ID);
    });

    it('references the posture snapshot_id', () => {
      data = data ?? loadJSON('trust-passport.json');
      expect(data.posture_ref).toBeDefined();
      expect(data.posture_ref.snapshot_id).toBe(SNAPSHOT_ID);
    });

    it('includes validity with issued_at and expires_at', () => {
      data = data ?? loadJSON('trust-passport.json');
      expect(data.validity).toBeDefined();
      expect(data.validity.issued_at).toBeDefined();
      expect(data.validity.expires_at).toBeDefined();
    });

    it('includes revocation status', () => {
      data = data ?? loadJSON('trust-passport.json');
      expect(data.revocation).toBeDefined();
      expect(data.revocation.revoked).toBe(false);
    });

    it('includes evidence_summary with framework mappings', () => {
      data = data ?? loadJSON('trust-passport.json');
      expect(data.evidence_summary).toBeDefined();
      expect(Array.isArray(data.evidence_summary.framework_mappings)).toBe(true);
      expect(data.evidence_summary.framework_mappings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cross-artifact consistency', () => {
    let agentbom: unknown;
    let posture: unknown;
    let passport: unknown;

    it('all artifacts share the same agent_id', () => {
      agentbom = loadJSON('agentbom.json');
      posture = loadJSON('posture.json');
      passport = loadJSON('trust-passport.json');

      const agentId = agentbom.identity.agent_id;
      expect(posture.identity.agent_id).toBe(agentId);
      expect(passport.identity.agent_id).toBe(agentId);
    });

    it('passport agentbom_ref matches AgentBOM identity', () => {
      agentbom = agentbom ?? loadJSON('agentbom.json');
      passport = passport ?? loadJSON('trust-passport.json');

      expect(passport.agentbom_ref.agentbom_id).toBe(agentbom.identity.agent_id);
    });

    it('passport posture_ref matches posture identity', () => {
      posture = posture ?? loadJSON('posture.json');
      passport = passport ?? loadJSON('trust-passport.json');

      expect(passport.posture_ref.snapshot_id).toBe(posture.identity.snapshot_id);
    });
  });
});
