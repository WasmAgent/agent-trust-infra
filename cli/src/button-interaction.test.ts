/**
 * Button Interaction Tests — 按钮交互测试
 *
 * Tests Bot API interaction by simulating "button presses" on each CLI command.
 * Each test simulates a user clicking a button that triggers a specific CLI command,
 * verifying the interaction produces the correct output and exit code.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let tmpDir: string;

const VALID_PASSPORT = {
  passport_version: '0.1',
  identity: {
    passport_id: 'passport-btn-001',
    agent_id: 'agent-btn-001',
    agent_name: 'Button Test Agent',
    issuer: 'btn-test-issuer',
    issuance_context: 'self-issued',
  },
  validity: {
    issued_at: '2026-01-01T00:00:00Z',
    expires_at: '2099-12-31T00:00:00Z',
    renewal_triggers: ['agentbom_changes'],
  },
  revocation: {
    revoked: false,
    revocation_triggers: ['critical_security_finding'],
  },
  attestation: {
    issuer: 'btn-test-issuer',
  },
};

const VALID_AGENTBOM = {
  agentbom_version: '0.1',
  identity: {
    agent_id: 'agent-btn-001',
    agent_name: 'Button Test Agent',
    deployment_context: 'development',
    generated_at: '2026-01-01T00:00:00Z',
  },
  attestation: { generator: 'btn-test' },
  tool_layer: [{ tool_id: 'fs-read', tool_name: 'read_file', source: 'builtin' }],
  risk_layer: [],
};

const VALID_POSTURE = {
  posture_version: '0.1',
  identity: {
    snapshot_id: 'posture-btn-001',
    agent_id: 'agent-btn-001',
    captured_at: '2026-01-01T00:00:00Z',
  },
  servers: [
    {
      server_id: 'srv-btn-1',
      server_name: 'Button Server',
      tools: [{ tool_id: 'tool-safe', tool_name: 'safe_tool', risk_severity: 'low' }],
    },
  ],
  risk_summary: [],
  attestation: { generator: 'btn-test' },
};

beforeEach(() => {
  tmpDir = join(tmpdir(), `btn-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

// ============================================================================
// Help button — 帮助按钮
// ============================================================================

describe('Button: --help', () => {
  it('shows usage info when help flag is clicked', async () => {
    const spy = spyOn(console, 'log');
    const result = await runCommand(['--help']);

    expect(result).toBe(0);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Usage:');
    expect(output).toContain('passport validate');
    expect(output).toContain('passport inspect');
    expect(output).toContain('agentbom inspect');
    expect(output).toContain('agentbom diff');
    expect(output).toContain('mcp-posture inspect');
  });

  it('shows usage info when -h flag is clicked', async () => {
    const spy = spyOn(console, 'log');
    const result = await runCommand(['-h']);

    expect(result).toBe(0);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Usage:');
  });

  it('shows usage info when no arguments are given', async () => {
    const spy = spyOn(console, 'log');
    const result = await runCommand([]);

    expect(result).toBe(0);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Usage:');
  });
});

// ============================================================================
// Unknown command button — 未知命令按钮
// ============================================================================

describe('Button: unknown command', () => {
  it('returns error for unknown command', async () => {
    const spy = spyOn(console, 'error');
    const result = await runCommand(['nonexistent']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('unknown command');
    expect(output).toContain('nonexistent');
  });
});

// ============================================================================
// Passport validate button — 护照验证按钮
// ============================================================================

describe('Button: passport validate', () => {
  it('clicking validate on valid passport returns success', async () => {
    const path = writeTmpFile('valid-passport.json', JSON.stringify(VALID_PASSPORT));
    const spy = spyOn(console, 'log');

    const result = await runCommand(['passport', 'validate', path]);

    expect(result).toBe(0);

    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('passport-btn-001');
    expect(output).toContain('Button Test Agent');
    expect(output).toContain('Passport is valid');
  });

  it('clicking validate on missing file returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['passport', 'validate', '/nonexistent/btn-passport.json']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('cannot read file');
  });

  it('clicking validate on invalid JSON returns error', async () => {
    const path = writeTmpFile('bad-passport.json', '{ broken json');
    const spy = spyOn(console, 'error');

    const result = await runCommand(['passport', 'validate', path]);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('not valid JSON');
  });

  it('clicking validate without path argument returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['passport', 'validate']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('requires a <path> argument');
  });

  it('clicking validate on expired passport returns error with expiry message', async () => {
    const expired = {
      ...VALID_PASSPORT,
      validity: {
        issued_at: '2020-01-01T00:00:00Z',
        expires_at: '2020-06-01T00:00:00Z',
      },
    };
    const path = writeTmpFile('expired-passport.json', JSON.stringify(expired));
    const logSpy = spyOn(console, 'log');
    const errSpy = spyOn(console, 'error');

    const result = await runCommand(['passport', 'validate', path]);

    expect(result).toBe(1);
    const errOutput = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(errOutput).toContain('EXPIRED');

    const logOutput = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logOutput).toContain('passport-btn-001');
  });
});

// ============================================================================
// Passport inspect button — 护照检查按钮
// ============================================================================

describe('Button: passport inspect', () => {
  it('clicking inspect displays passport details', async () => {
    const path = writeTmpFile('inspect-passport.json', JSON.stringify(VALID_PASSPORT));
    const spy = spyOn(console, 'log');

    const result = await runCommand(['passport', 'inspect', path]);

    expect(result).toBe(0);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Trust Passport v0.1');
    expect(output).toContain('passport-btn-001');
    expect(output).toContain('Button Test Agent');
    expect(output).toContain('btn-test-issuer');
    expect(output).toContain('Active');
  });

  it('clicking inspect on expired passport shows EXPIRED status', async () => {
    const expired = {
      ...VALID_PASSPORT,
      validity: {
        issued_at: '2020-01-01T00:00:00Z',
        expires_at: '2020-06-01T00:00:00Z',
      },
    };
    const path = writeTmpFile('inspect-expired.json', JSON.stringify(expired));
    const spy = spyOn(console, 'log');

    const result = await runCommand(['passport', 'inspect', path]);

    expect(result).toBe(0);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('EXPIRED');
  });

  it('clicking inspect on non-existent file returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['passport', 'inspect', '/nonexistent/btn-inspect.json']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('cannot read file');
  });

  it('clicking inspect without path argument returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['passport', 'inspect']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('requires a <path> argument');
  });
});

// ============================================================================
// AgentBOM inspect button — AgentBOM检查按钮
// ============================================================================

describe('Button: agentbom inspect', () => {
  it('clicking inspect displays AgentBOM details', async () => {
    const path = writeTmpFile('inspect-bom.json', JSON.stringify(VALID_AGENTBOM));
    const spy = spyOn(console, 'log');

    const result = await runCommand(['agentbom', 'inspect', path]);

    expect(result).toBe(0);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('AgentBOM v0.1');
    expect(output).toContain('Button Test Agent');
    expect(output).toContain('agent-btn-001');
    expect(output).toContain('development');
    expect(output).toContain('Tools:');
  });

  it('clicking inspect on non-existent file returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['agentbom', 'inspect', '/nonexistent/btn-bom.json']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
  });

  it('clicking inspect on invalid JSON returns error', async () => {
    const path = writeTmpFile('bad-bom.json', '{ broken');
    const spy = spyOn(console, 'error');

    const result = await runCommand(['agentbom', 'inspect', path]);

    expect(result).toBe(1);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('not valid JSON');
  });

  it('clicking inspect without path argument returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['agentbom', 'inspect']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('requires a <path> argument');
  });
});

// ============================================================================
// AgentBOM diff button — AgentBOM差异按钮
// ============================================================================

describe('Button: agentbom diff', () => {
  it('clicking diff on identical AgentBOMs returns clean', async () => {
    const oldPath = writeTmpFile('old-bom.json', JSON.stringify(VALID_AGENTBOM));
    const newPath = writeTmpFile('new-bom.json', JSON.stringify(VALID_AGENTBOM));
    const spy = spyOn(console, 'log');

    const result = await runCommand(['agentbom', 'diff', oldPath, newPath]);

    expect(result).toBe(0);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('No differences found');
  });

  it('clicking diff on changed AgentBOMs shows changes', async () => {
    const changedBom = {
      ...VALID_AGENTBOM,
      tool_layer: [
        { tool_id: 'fs-read', tool_name: 'read_file', source: 'builtin' },
        { tool_id: 'fs-write', tool_name: 'write_file', source: 'builtin' },
      ],
    };
    const oldPath = writeTmpFile('old-diff.json', JSON.stringify(VALID_AGENTBOM));
    const newPath = writeTmpFile('new-diff.json', JSON.stringify(changedBom));
    const spy = spyOn(console, 'log');

    const result = await runCommand(['agentbom', 'diff', oldPath, newPath]);

    expect(result).toBe(1);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Tools added');
    expect(output).toContain('write_file');
  });

  it('clicking diff on non-existent old file returns error', async () => {
    const newPath = writeTmpFile('new-only.json', JSON.stringify(VALID_AGENTBOM));
    const spy = spyOn(console, 'error');

    const result = await runCommand(['agentbom', 'diff', '/nonexistent/old.json', newPath]);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
  });

  it('clicking diff on non-existent new file returns error', async () => {
    const oldPath = writeTmpFile('old-only.json', JSON.stringify(VALID_AGENTBOM));
    const spy = spyOn(console, 'error');

    const result = await runCommand(['agentbom', 'diff', oldPath, '/nonexistent/new.json']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
  });

  it('clicking diff without enough arguments returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['agentbom', 'diff', '/tmp/a.json']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('requires <old> and <new> path arguments');
  });
});

// ============================================================================
// MCP Posture inspect button — MCP态势检查按钮
// ============================================================================

describe('Button: mcp-posture inspect', () => {
  it('clicking inspect displays posture details', async () => {
    const path = writeTmpFile('inspect-posture.json', JSON.stringify(VALID_POSTURE));
    const spy = spyOn(console, 'log');

    const result = await runCommand(['mcp-posture', 'inspect', path]);

    expect(result).toBe(0);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('MCP Posture v0.1');
    expect(output).toContain('posture-btn-001');
    expect(output).toContain('agent-btn-001');
    expect(output).toContain('Servers:');
    expect(output).toContain('Tools:');
  });

  it('clicking inspect on non-existent file returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['mcp-posture', 'inspect', '/nonexistent/btn-posture.json']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
  });

  it('clicking inspect on invalid JSON returns error', async () => {
    const path = writeTmpFile('bad-posture.json', '{ broken');
    const spy = spyOn(console, 'error');

    const result = await runCommand(['mcp-posture', 'inspect', path]);

    expect(result).toBe(1);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('not valid JSON');
  });

  it('clicking inspect without path argument returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['mcp-posture', 'inspect']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('requires a <path> argument');
  });

  it('clicking inspect on posture with critical findings shows findings', async () => {
    const riskyPosture = {
      ...VALID_POSTURE,
      risk_summary: [
        {
          finding_id: 'finding-critical-001',
          severity: 'critical',
          category: 'command_execution',
          description: 'Allows arbitrary command execution',
          tool_id: 'tool-dangerous',
        },
      ],
      servers: [
        {
          server_id: 'srv-risky',
          server_name: 'Risky Server',
          tools: [
            { tool_id: 'tool-dangerous', tool_name: 'dangerous_tool', risk_severity: 'critical' },
          ],
        },
      ],
    };
    const path = writeTmpFile('risky-posture.json', JSON.stringify(riskyPosture));
    const spy = spyOn(console, 'log');

    const result = await runCommand(['mcp-posture', 'inspect', path]);

    expect(result).toBe(0);
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('[CRITICAL]');
    expect(output).toContain('finding-critical-001');
    expect(output).toContain('Allows arbitrary command execution');
  });
});

// ============================================================================
// Unknown subcommand buttons — 未知子命令按钮
// ============================================================================

describe('Button: unknown subcommands', () => {
  it('clicking unknown passport subcommand returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['passport', 'nonexistent']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('unknown passport subcommand');
  });

  it('clicking unknown agentbom subcommand returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['agentbom', 'nonexistent']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('unknown agentbom subcommand');
  });

  it('clicking unknown mcp-posture subcommand returns error', async () => {
    const spy = spyOn(console, 'error');

    const result = await runCommand(['mcp-posture', 'nonexistent']);

    expect(result).toBe(1);
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('unknown mcp-posture subcommand');
  });
});

// ============================================================================
// Cross-command interaction — 跨命令交互
// ============================================================================

describe('Button: cross-command interaction', () => {
  it('validates then inspects the same passport successfully', async () => {
    const path = writeTmpFile('cross-passport.json', JSON.stringify(VALID_PASSPORT));

    // Click validate button
    const validateSpy = spyOn(console, 'log');
    const validateResult = runCommand(['passport', 'validate', path]);
    expect(validateResult).toBe(0);
    validateSpy.mockClear();

    // Click inspect button on the same file
    const inspectResult = runCommand(['passport', 'inspect', path]);
    expect(inspectResult).toBe(0);

    const inspectOutput = validateSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(inspectOutput).toContain('passport-btn-001');
  });

  it('diffs AgentBOMs then inspects the new one', async () => {
    const oldBom = { ...VALID_AGENTBOM };
    const newBom = {
      ...VALID_AGENTBOM,
      tool_layer: [
        { tool_id: 'fs-read', tool_name: 'read_file', source: 'builtin' },
        { tool_id: 'fs-write', tool_name: 'write_file', source: 'builtin' },
      ],
    };
    const oldPath = writeTmpFile('cross-old.json', JSON.stringify(oldBom));
    const newPath = writeTmpFile('cross-new.json', JSON.stringify(newBom));

    // Click diff button
    const diffSpy = spyOn(console, 'log');
    const diffResult = runCommand(['agentbom', 'diff', oldPath, newPath]);
    expect(diffResult).toBe(1);
    diffSpy.mockClear();

    // Click inspect button on the new AgentBOM
    const inspectResult = runCommand(['agentbom', 'inspect', newPath]);
    expect(inspectResult).toBe(0);
  });

  it('inspects posture and validates passport for the same agent', async () => {
    const passportPath = writeTmpFile('agent-passport.json', JSON.stringify(VALID_PASSPORT));
    const posturePath = writeTmpFile('agent-posture.json', JSON.stringify(VALID_POSTURE));

    // Click passport validate
    const validateResult = runCommand(['passport', 'validate', passportPath]);
    expect(validateResult).toBe(0);

    // Click posture inspect
    const postureSpy = spyOn(console, 'log');
    const postureResult = runCommand(['mcp-posture', 'inspect', posturePath]);
    expect(postureResult).toBe(0);

    const postureOutput = postureSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(postureOutput).toContain('agent-btn-001');
  });
});
