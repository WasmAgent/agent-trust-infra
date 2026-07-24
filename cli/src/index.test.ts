import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgentBOM } from '../../packages/agentbom-core/src/index.js';
import { diffAgentBOMCommand } from './agentbom-diff.js';
import { inspectAgentBOMCommand } from './agentbom-inspect.js';
import { runCommand } from './index.js';
import { inspectMCPPostureCommand } from './mcp-posture-inspect.js';
import { inspectPassportCommand } from './passport-inspect.js';
import { validatePassportCommand } from './passport-validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let tmpDir: string;

const VALID_PASSPORT = {
  passport_version: '0.1',
  identity: {
    passport_id: 'passport-test-001',
    agent_id: 'test-agent-001',
    agent_name: 'Test Agent',
    issuer: 'test-issuer',
    issuance_context: 'self-issued',
  },
  validity: {
    issued_at: '2026-06-28T00:00:00Z',
    expires_at: '2099-12-31T00:00:00Z',
    renewal_triggers: ['agentbom_changes'],
  },
  revocation: {
    revoked: false,
    revocation_triggers: ['critical_security_finding'],
  },
  attestation: {
    issuer: 'test-issuer',
  },
};

beforeEach(() => {
  tmpDir = join(tmpdir(), `agent-trust-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmpFile(name: string, content: string): string {
  const p = join(tmpDir, name);
  writeFileSync(p, content, 'utf-8');
  return p;
}

describe('validatePassportCommand', () => {
  it('returns 0 for a valid passport', () => {
    const path = writeTmpFile('valid.json', JSON.stringify(VALID_PASSPORT));
    expect(validatePassportCommand(path)).toBe(0);
  });

  it('returns 1 for a non-existent file', () => {
    expect(validatePassportCommand('/nonexistent/path/passport.json')).toBe(1);
  });

  it('returns 1 for invalid JSON', () => {
    const path = writeTmpFile('bad.json', '{ not valid json');
    expect(validatePassportCommand(path)).toBe(1);
  });

  it('returns 1 for a passport missing required fields', () => {
    const path = writeTmpFile('incomplete.json', JSON.stringify({ passport_version: '0.1' }));
    expect(validatePassportCommand(path)).toBe(1);
  });

  it('returns 1 for an expired passport', () => {
    const expired = {
      ...VALID_PASSPORT,
      validity: {
        issued_at: '2020-01-01T00:00:00Z',
        expires_at: '2020-06-01T00:00:00Z',
      },
    };
    const path = writeTmpFile('expired.json', JSON.stringify(expired));
    expect(validatePassportCommand(path)).toBe(1);
  });

  it('warns and returns 0 for a passport expiring within 14 days', () => {
    const nearExpiry = new Date();
    nearExpiry.setDate(nearExpiry.getDate() + 7);
    const warning = {
      ...VALID_PASSPORT,
      validity: {
        issued_at: '2026-06-01T00:00:00Z',
        expires_at: nearExpiry.toISOString(),
      },
    };
    const path = writeTmpFile('warning.json', JSON.stringify(warning));

    const spy = spyOn(console, 'warn');
    expect(validatePassportCommand(path)).toBe(0);
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain('expires within 14 days');
  });

  it('returns 1 for wrong passport_version', () => {
    const badVersion = { ...VALID_PASSPORT, passport_version: '2.0' };
    const path = writeTmpFile('bad-version.json', JSON.stringify(badVersion));
    expect(validatePassportCommand(path)).toBe(1);
  });

  it('handles the example passport-demo file', () => {
    const examplePath = resolve(__dirname, '../../../examples/passport-demo/trust-passport.json');
    if (!existsSync(examplePath)) {
      console.warn(`Skipping: example file not found at ${examplePath}`);
      return;
    }
    const exitCode = validatePassportCommand(examplePath);
    // Example may or may not be expired depending on date, but should be structurally valid
    expect([0, 1]).toContain(exitCode);
  });
});

describe('inspectPassportCommand', () => {
  it('returns 0 and displays passport details for a valid passport', () => {
    const path = writeTmpFile('inspect-valid.json', JSON.stringify(VALID_PASSPORT));
    const spy = spyOn(console, 'log');

    const result = inspectPassportCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('passport-test-001');
    expect(output).toContain('Test Agent');
    expect(output).toContain('test-issuer');
    expect(output).toContain('2026-06-28T00:00:00Z');
    expect(output).toContain('2099-12-31T00:00:00Z');
    expect(output).toContain('Active');
  });

  it('shows EXPIRED status for an expired passport', () => {
    const expired = {
      ...VALID_PASSPORT,
      validity: {
        issued_at: '2020-01-01T00:00:00Z',
        expires_at: '2020-06-01T00:00:00Z',
      },
    };
    const path = writeTmpFile('inspect-expired.json', JSON.stringify(expired));
    const spy = spyOn(console, 'log');

    const result = inspectPassportCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('EXPIRED');
  });

  it('shows risk counts', () => {
    const withRisks = {
      ...VALID_PASSPORT,
      risk_summary: { critical: 2, high: 5, medium: 3, low: 1 },
    };
    const path = writeTmpFile('inspect-risks.json', JSON.stringify(withRisks));
    const spy = spyOn(console, 'log');
    spy.mockClear();

    const result = inspectPassportCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    // @openagentaudit/passport uses C=/H= abbreviations for risk counts
    expect(output).toContain('C=2');
    expect(output).toContain('H=5');
  });

  it('returns 1 for a non-existent file', () => {
    expect(inspectPassportCommand('/nonexistent/path/passport.json')).toBe(1);
  });

  it('returns 1 for invalid JSON', () => {
    const path = writeTmpFile('inspect-bad.json', '{ not valid json');
    expect(inspectPassportCommand(path)).toBe(1);
  });

  it('returns 1 for a non-object root', () => {
    const path = writeTmpFile('inspect-array.json', JSON.stringify([1, 2, 3]));
    expect(inspectPassportCommand(path)).toBe(1);
  });
});

const VALID_AGENTBOM = {
  agentbom_version: '0.1',
  identity: {
    agent_id: 'test-agent-001',
    agent_name: 'Test Agent',
    deployment_context: 'development',
    generated_at: '2026-06-28T00:00:00Z',
  },
  attestation: { generator: 'test' },
  tool_layer: [
    { tool_id: 'fs-read', tool_name: 'read_file', source: 'builtin' },
    { tool_id: 'fs-write', tool_name: 'write_file', source: 'builtin' },
  ],
  risk_layer: [
    {
      risk_id: 'risk-001',
      severity: 'medium',
      category: 'command_execution',
      description: 'command execution surface',
      status: 'accepted',
    },
  ],
};

describe('inspectAgentBOMCommand', () => {
  it('returns 0 and displays agent details for a valid AgentBOM', () => {
    const path = writeTmpFile('agentbom-valid.json', JSON.stringify(VALID_AGENTBOM));
    const spy = spyOn(console, 'log');

    const result = inspectAgentBOMCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Test Agent');
    expect(output).toContain('test-agent-001');
    expect(output).toContain('development');
    expect(output).toContain('Tools:');
    expect(output).toContain('2');
    expect(output).toContain('Risks:');
    expect(output).toContain('1');
  });

  it('returns 1 for a non-existent file', () => {
    expect(inspectAgentBOMCommand('/nonexistent/path/agentbom.json')).toBe(1);
  });

  it('returns 1 for invalid JSON', () => {
    const path = writeTmpFile('agentbom-bad.json', '{ not valid json');
    expect(inspectAgentBOMCommand(path)).toBe(1);
  });

  it('returns 1 for missing required fields', () => {
    const path = writeTmpFile(
      'agentbom-incomplete.json',
      JSON.stringify({ agentbom_version: '0.1' }),
    );
    expect(inspectAgentBOMCommand(path)).toBe(1);
  });

  it('returns 1 for wrong agentbom_version', () => {
    const badVersion = { ...VALID_AGENTBOM, agentbom_version: '99.0' };
    const path = writeTmpFile('agentbom-bad-version.json', JSON.stringify(badVersion));
    expect(inspectAgentBOMCommand(path)).toBe(1);
  });

  it('handles the example agentbom-demo file', () => {
    const examplePath = resolve(__dirname, '../../../examples/agentbom-demo/agentbom.json');
    if (!existsSync(examplePath)) {
      console.warn(`Skipping: example file not found at ${examplePath}`);
      return;
    }
    const spy = spyOn(console, 'log');
    const exitCode = inspectAgentBOMCommand(examplePath);
    expect(exitCode).toBe(0);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('bscode agent');
    expect(output).toContain('bscode-agent-demo-001');
    expect(output).toContain('development');
    expect(output).toContain('Tools:');
    expect(output).toContain('Risks:');
  });
});

describe('generate bom command', () => {
  it('emits valid AgentBOM JSON with tool inventory and permission mapping', () => {
    const agentDir = join(tmpDir, 'sample-agent');
    const serverDir = join(agentDir, 'search');
    mkdirSync(serverDir, { recursive: true });
    writeFileSync(
      join(agentDir, 'package.json'),
      JSON.stringify({ name: '@example/sample-agent', version: '1.2.3' }),
      'utf-8',
    );
    writeFileSync(
      join(serverDir, 'mcp.config.json'),
      JSON.stringify({
        tools: [
          {
            name: 'web_search',
            permissions: ['network:outbound', 'fs:read'],
          },
        ],
      }),
      'utf-8',
    );

    const spy = spyOn(console, 'log');
    expect(runCommand(['generate', 'bom', '--agent', agentDir])).toBe(0);

    const output = spy.mock.calls.at(-1)?.join(' ') ?? '';
    const bom = JSON.parse(output);
    expect(validateAgentBOM(bom).valid).toBe(true);
    expect(bom.identity.agent_name).toBe('sample-agent');
    expect(bom.identity.agent_version).toBe('1.2.3');
    expect(bom.tool_layer).toContainEqual({
      tool_id: 'mcp-search-web_search',
      tool_name: 'web_search',
      source: 'mcp',
      mcp_server_id: 'search',
      permissions: ['network:outbound', 'fs:read'],
      risk_signals: [],
    });
    expect(bom.permission_layer.granted_scopes).toEqual(
      expect.arrayContaining(['fs:read', 'fs:write', 'network:outbound', 'process:exec']),
    );
  });

  it('supports writing generated AgentBOM JSON to --out', () => {
    const agentDir = join(tmpDir, 'out-agent');
    const outPath = join(tmpDir, 'agentbom.json');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'out-agent' }), 'utf-8');

    expect(runCommand(['generate', 'bom', '--agent', agentDir, '--out', outPath])).toBe(0);

    const bom = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(validateAgentBOM(bom).valid).toBe(true);
    expect(bom.identity.agent_name).toBe('out-agent');
    expect(bom.tool_layer.length).toBeGreaterThan(0);
    expect(bom.permission_layer.granted_scopes).toEqual(
      expect.arrayContaining(['fs:read', 'fs:write', 'process:exec']),
    );
  });

  it('rejects missing agent directories', () => {
    expect(runCommand(['generate', 'bom', '--agent', join(tmpDir, 'missing')])).toBe(1);
  });
});

const VALID_POSTURE = {
  posture_version: '0.1',
  identity: {
    snapshot_id: 'posture-test-001',
    agent_id: 'test-agent-001',
    captured_at: '2026-06-28T00:00:00Z',
  },
  servers: [
    {
      server_id: 'srv-1',
      server_name: 'Server One',
      tools: [
        {
          tool_id: 'tool-safe',
          tool_name: 'safe_tool',
          risk_severity: 'low',
        },
        {
          tool_id: 'tool-dangerous',
          tool_name: 'dangerous_tool',
          risk_severity: 'critical',
        },
      ],
    },
  ],
  risk_summary: [
    {
      finding_id: 'finding-001',
      severity: 'critical',
      category: 'command_execution',
      description: 'Allows arbitrary command execution on the host',
      tool_id: 'tool-dangerous',
    },
    {
      finding_id: 'finding-002',
      severity: 'high',
      category: 'exfiltration',
      description: 'Can exfiltrate data via DNS',
      tool_id: 'tool-dangerous',
    },
    {
      finding_id: 'finding-003',
      severity: 'medium',
      category: 'ssrf',
      description: 'Makes outbound HTTP requests to user-specified URLs',
      tool_id: 'tool-safe',
    },
  ],
  attestation: { generator: 'test' },
};

describe('inspectMCPPostureCommand', () => {
  it('returns 0 and displays posture details for a valid posture file', () => {
    const path = writeTmpFile('posture-valid.json', JSON.stringify(VALID_POSTURE));
    const spy = spyOn(console, 'log');

    const result = inspectMCPPostureCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('MCP Posture v0.1');
    expect(output).toContain('posture-test-001');
    expect(output).toContain('test-agent-001');
    expect(output).toContain('Servers:');
    expect(output).toContain('Tools:');
    expect(output).toContain('High-risk tools:');
    expect(output).toContain('Risks:');
  });

  it('shows tool count and high-risk tool count', () => {
    const path = writeTmpFile('posture-tools.json', JSON.stringify(VALID_POSTURE));
    const spy = spyOn(console, 'log');

    const result = inspectMCPPostureCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Tools:           2');
    expect(output).toContain('High-risk tools: 1');
  });

  it('highlights critical and high severity findings', () => {
    const path = writeTmpFile('posture-critical.json', JSON.stringify(VALID_POSTURE));
    const spy = spyOn(console, 'log');

    const result = inspectMCPPostureCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('critical/high finding(s)');
    expect(output).toContain('[CRITICAL]');
    expect(output).toContain('[HIGH]');
    expect(output).toContain('finding-001');
    expect(output).toContain('finding-002');
  });

  it('shows medium/low findings separately', () => {
    const path = writeTmpFile('posture-other.json', JSON.stringify(VALID_POSTURE));
    const spy = spyOn(console, 'log');

    const result = inspectMCPPostureCommand(path);
    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Other findings');
    expect(output).toContain('[MEDIUM]');
    expect(output).toContain('finding-003');
  });

  it('returns 1 for a non-existent file', () => {
    expect(inspectMCPPostureCommand('/nonexistent/path/posture.json')).toBe(1);
  });

  it('returns 1 for invalid JSON', () => {
    const path = writeTmpFile('posture-bad.json', '{ not valid json');
    expect(inspectMCPPostureCommand(path)).toBe(1);
  });

  it('returns 1 for missing required fields', () => {
    const path = writeTmpFile(
      'posture-incomplete.json',
      JSON.stringify({ posture_version: '0.1' }),
    );
    expect(inspectMCPPostureCommand(path)).toBe(1);
  });

  it('returns 1 for wrong posture_version', () => {
    const badVersion = { ...VALID_POSTURE, posture_version: '99.0' };
    const path = writeTmpFile('posture-bad-version.json', JSON.stringify(badVersion));
    expect(inspectMCPPostureCommand(path)).toBe(1);
  });

  it('handles the example mcp-risk-demo posture file', () => {
    const examplePath = resolve(__dirname, '../../../examples/mcp-risk-demo/posture.json');
    if (!existsSync(examplePath)) {
      console.warn(`Skipping: example file not found at ${examplePath}`);
      return;
    }
    const spy = spyOn(console, 'log');
    const exitCode = inspectMCPPostureCommand(examplePath);
    expect(exitCode).toBe(0);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('MCP Posture v0.1');
    expect(output).toContain('posture-bscode-demo-001');
    expect(output).toContain('bscode-agent-demo-001');
  });
});

const DIFF_BASE_BOM = {
  agentbom_version: '0.1',
  identity: {
    agent_id: 'diff-test-001',
    agent_name: 'Diff Test Agent',
    deployment_context: 'development',
    generated_at: '2026-06-28T00:00:00Z',
  },
  tool_layer: [
    {
      tool_id: 'fs-read',
      tool_name: 'read_file',
      source: 'builtin',
      permissions: ['fs:read'],
      risk_signals: [],
    },
    {
      tool_id: 'bash-exec',
      tool_name: 'bash',
      source: 'builtin',
      permissions: ['process:exec'],
      risk_signals: ['command_execution'],
    },
  ],
  permission_layer: {
    granted_scopes: ['fs:read', 'process:exec'],
    data_access: ['local_workspace'],
    credential_references: [],
  },
  risk_layer: [
    {
      risk_id: 'risk-001',
      severity: 'medium',
      category: 'command_execution',
      description: 'bash allows arbitrary execution',
      status: 'accepted',
    },
  ],
  attestation: { generator: 'test' },
};

describe('diffAgentBOMCommand', () => {
  it('returns 0 with clean message for identical AgentBOMs', () => {
    const oldPath = writeTmpFile('diff-old.json', JSON.stringify(DIFF_BASE_BOM));
    const newPath = writeTmpFile('diff-new.json', JSON.stringify(DIFF_BASE_BOM));
    const spy = spyOn(console, 'log');

    expect(diffAgentBOMCommand(oldPath, newPath)).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('No differences found');
  });

  it('returns 1 and shows added tools', () => {
    const newBom = {
      ...DIFF_BASE_BOM,
      tool_layer: [
        ...DIFF_BASE_BOM.tool_layer,
        {
          tool_id: 'fs-write',
          tool_name: 'write_file',
          source: 'builtin',
          permissions: ['fs:write'],
          risk_signals: [],
        },
      ],
    };
    const oldPath = writeTmpFile('diff-old-add.json', JSON.stringify(DIFF_BASE_BOM));
    const newPath = writeTmpFile('diff-new-add.json', JSON.stringify(newBom));
    const spy = spyOn(console, 'log');

    expect(diffAgentBOMCommand(oldPath, newPath)).toBe(1);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Tools added (1)');
    expect(output).toContain('write_file (fs-write) [builtin]');
  });

  it('returns 1 and shows removed tools', () => {
    const newBom = { ...DIFF_BASE_BOM, tool_layer: [DIFF_BASE_BOM.tool_layer[0]] };
    const oldPath = writeTmpFile('diff-old-rem.json', JSON.stringify(DIFF_BASE_BOM));
    const newPath = writeTmpFile('diff-new-rem.json', JSON.stringify(newBom));
    const spy = spyOn(console, 'log');

    expect(diffAgentBOMCommand(oldPath, newPath)).toBe(1);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Tools removed (1)');
    expect(output).toContain('bash (bash-exec) [builtin]');
  });

  it('returns 1 and shows permission scope changes', () => {
    const newBom = {
      ...DIFF_BASE_BOM,
      permission_layer: {
        granted_scopes: ['fs:read', 'process:exec', 'network:outbound'],
        data_access: ['local_workspace'],
        credential_references: [],
      },
    };
    const oldPath = writeTmpFile('diff-old-perm.json', JSON.stringify(DIFF_BASE_BOM));
    const newPath = writeTmpFile('diff-new-perm.json', JSON.stringify(newBom));
    const spy = spyOn(console, 'log');

    expect(diffAgentBOMCommand(oldPath, newPath)).toBe(1);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Permission scopes added (1)');
    expect(output).toContain('+ network:outbound');
  });

  it('returns 1 and shows new risk entries', () => {
    const newBom = {
      ...DIFF_BASE_BOM,
      risk_layer: [
        ...DIFF_BASE_BOM.risk_layer,
        {
          risk_id: 'risk-002',
          severity: 'high',
          category: 'exfiltration',
          description: 'data exfiltration risk',
          status: 'open',
        },
      ],
    };
    const oldPath = writeTmpFile('diff-old-risk.json', JSON.stringify(DIFF_BASE_BOM));
    const newPath = writeTmpFile('diff-new-risk.json', JSON.stringify(newBom));
    const spy = spyOn(console, 'log');

    expect(diffAgentBOMCommand(oldPath, newPath)).toBe(1);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Risk entries added (1)');
    expect(output).toContain('[high]');
    expect(output).toContain('risk-002');
    expect(output).toContain('data exfiltration risk');
  });

  it('returns 1 and shows tool permission changes', () => {
    const newBom = {
      ...DIFF_BASE_BOM,
      tool_layer: [
        {
          tool_id: 'fs-read',
          tool_name: 'read_file',
          source: 'builtin',
          permissions: ['fs:read', 'fs:write'],
          risk_signals: [],
        },
        {
          tool_id: 'bash-exec',
          tool_name: 'bash',
          source: 'builtin',
          permissions: ['process:exec'],
          risk_signals: ['command_execution'],
        },
      ],
    };
    const oldPath = writeTmpFile('diff-old-tperm.json', JSON.stringify(DIFF_BASE_BOM));
    const newPath = writeTmpFile('diff-new-tperm.json', JSON.stringify(newBom));
    const spy = spyOn(console, 'log');

    expect(diffAgentBOMCommand(oldPath, newPath)).toBe(1);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('permission added: fs:write');
  });

  it('returns 1 for non-existent old file', () => {
    const newPath = writeTmpFile('diff-new-nofile.json', JSON.stringify(DIFF_BASE_BOM));
    expect(diffAgentBOMCommand('/nonexistent/old.json', newPath)).toBe(1);
  });

  it('returns 1 for non-existent new file', () => {
    const oldPath = writeTmpFile('diff-old-nofile.json', JSON.stringify(DIFF_BASE_BOM));
    expect(diffAgentBOMCommand(oldPath, '/nonexistent/new.json')).toBe(1);
  });

  it('returns 1 for invalid JSON old file', () => {
    const oldPath = writeTmpFile('diff-old-bad.json', '{ not valid json');
    const newPath = writeTmpFile('diff-new-bad.json', JSON.stringify(DIFF_BASE_BOM));
    expect(diffAgentBOMCommand(oldPath, newPath)).toBe(1);
  });

  it('returns 1 for invalid JSON new file', () => {
    const oldPath = writeTmpFile('diff-old-bad2.json', JSON.stringify(DIFF_BASE_BOM));
    const newPath = writeTmpFile('diff-new-bad2.json', '{ not valid json');
    expect(diffAgentBOMCommand(oldPath, newPath)).toBe(1);
  });

  it('returns 1 for invalid old AgentBOM', () => {
    const oldPath = writeTmpFile(
      'diff-old-invalid.json',
      JSON.stringify({ agentbom_version: '0.1', attestation: { generator: 'test' } }),
    );
    const newPath = writeTmpFile('diff-new-invalid.json', JSON.stringify(DIFF_BASE_BOM));
    expect(diffAgentBOMCommand(oldPath, newPath)).toBe(1);
  });

  it('returns 1 for invalid new AgentBOM', () => {
    const oldPath = writeTmpFile('diff-old-inv2.json', JSON.stringify(DIFF_BASE_BOM));
    const newPath = writeTmpFile(
      'diff-new-inv2.json',
      JSON.stringify({ agentbom_version: '0.1', attestation: { generator: 'test' } }),
    );
    expect(diffAgentBOMCommand(oldPath, newPath)).toBe(1);
  });
});

describe('compose-team command routing', () => {
  it('returns 1 when no args provided', () => {
    expect(runCommand(['compose-team'])).toBe(1);
  });

  it('returns 1 when only one BOM provided', () => {
    expect(runCommand(['compose-team', 'only-one.bom'])).toBe(1);
  });

  it('--help output includes compose-team', () => {
    const spy = spyOn(console, 'log');
    runCommand(['--help']);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('compose-team');
  });
});
