import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RISK_CATEGORIES,
  diffMCPPosture,
  formatPostureDiff,
  inspectMCPPosture,
  validateMCPPosture,
} from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VALID_POSTURE = {
  posture_version: '0.1',
  identity: {
    snapshot_id: 'posture-test-001',
    agent_id: 'test-agent-001',
    captured_at: '2026-06-28T00:00:00Z',
  },
  servers: [
    {
      server_id: 'test-server',
      server_name: 'Test Server',
      tools: [
        {
          tool_id: 'test-tool',
          tool_name: 'test_tool',
        },
      ],
    },
  ],
  attestation: { generator: 'test' },
};

describe('validateMCPPosture', () => {
  it('accepts valid MCP Posture', () => {
    const result = validateMCPPosture(VALID_POSTURE);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects non-object root', () => {
    expect(validateMCPPosture(null).valid).toBe(false);
    expect(validateMCPPosture('string').valid).toBe(false);
    expect(validateMCPPosture(42).valid).toBe(false);
    expect(validateMCPPosture([]).valid).toBe(false);
  });

  it('rejects missing posture_version', () => {
    const { posture_version, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('missing required: posture_version');
  });

  it('rejects missing identity', () => {
    const { identity, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('missing required: identity');
  });

  it('rejects missing servers', () => {
    const { servers, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('missing required: servers');
  });

  it('rejects missing attestation', () => {
    const { attestation, ...rest } = VALID_POSTURE;
    const result = validateMCPPosture(rest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('missing required: attestation');
  });

  it('rejects unknown posture_version', () => {
    const result = validateMCPPosture({ ...VALID_POSTURE, posture_version: '99.0' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('posture_version must be "0.1"');
  });

  describe('identity object', () => {
    it('requires snapshot_id', () => {
      const posture = {
        ...VALID_POSTURE,
        identity: { agent_id: 'test-agent', captured_at: '2026-06-28T00:00:00Z' },
      };
      const result = validateMCPPosture(posture);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('identity: missing snapshot_id');
    });

    it('requires agent_id', () => {
      const posture = {
        ...VALID_POSTURE,
        identity: { snapshot_id: 'snap-001', captured_at: '2026-06-28T00:00:00Z' },
      };
      const result = validateMCPPosture(posture);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('identity: missing agent_id');
    });

    it('requires captured_at', () => {
      const posture = {
        ...VALID_POSTURE,
        identity: { snapshot_id: 'snap-001', agent_id: 'test-agent' },
      };
      const result = validateMCPPosture(posture);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('identity: missing captured_at');
    });
  });
});

describe('schema risk categories', () => {
  it('includes all 8 risk categories from the taxonomy (7 original + mcp_header_leakage)', () => {
    const schemaPath = join(__dirname, '../../../specs/mcp-posture/schema.json');
    const raw = readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(raw);

    const toolRiskCategories =
      (schema.properties?.servers?.items?.properties?.tools?.items?.properties?.risk_categories
        ?.items?.enum as string[]) ?? [];
    for (const cat of RISK_CATEGORIES) {
      expect(toolRiskCategories).toContain(cat);
    }
    expect(toolRiskCategories).toHaveLength(8);
  });

  it('risk_summary.category also has all 8 risk categories in the enum', () => {
    const schemaPath = join(__dirname, '../../../specs/mcp-posture/schema.json');
    const raw = readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(raw);

    const summaryCategoryEnum =
      (schema.properties?.risk_summary?.items?.properties?.category?.enum as string[]) ?? [];
    for (const cat of RISK_CATEGORIES) {
      expect(summaryCategoryEnum).toContain(cat);
    }
    expect(summaryCategoryEnum).toHaveLength(8);
  });

  it('RISK_CATEGORIES export includes mcp_header_leakage', () => {
    expect(RISK_CATEGORIES).toContain('mcp_header_leakage');
  });
});

describe('schema covers MCP 2026-07-28 fields', () => {
  it('schema has protocol_version field', () => {
    const schemaPath = join(__dirname, '../../../specs/mcp-posture/schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    expect(schema.properties).toHaveProperty('protocol_version');
  });

  it('schema has session_model on servers items', () => {
    const schemaPath = join(__dirname, '../../../specs/mcp-posture/schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const serverProps = schema.properties?.servers?.items?.properties;
    expect(serverProps).toHaveProperty('session_model');
    expect(serverProps.session_model.enum).toContain('stateless-handle');
  });

  it('schema has handle_expiry_policy on servers items', () => {
    const schemaPath = join(__dirname, '../../../specs/mcp-posture/schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const serverProps = schema.properties?.servers?.items?.properties;
    expect(serverProps).toHaveProperty('handle_expiry_policy');
  });

  it('schema has attestation.auth with OAuth fields', () => {
    const schemaPath = join(__dirname, '../../../specs/mcp-posture/schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const authProps = schema.properties?.attestation?.properties?.auth?.properties;
    expect(authProps).toHaveProperty('audience_bound_token_validated');
    expect(authProps).toHaveProperty('pkce_used');
    expect(authProps).toHaveProperty('per_client_consent_verified');
  });

  it('schema has owasp_agentic_ref on risk_summary items', () => {
    const schemaPath = join(__dirname, '../../../specs/mcp-posture/schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const riskProps = schema.properties?.risk_summary?.items?.properties;
    expect(riskProps).toHaveProperty('owasp_agentic_ref');
  });

  it('posture with stateless-handle session_model is still valid', () => {
    const posture = {
      ...VALID_POSTURE,
      protocol_version: '2026-07-28',
      servers: [
        {
          server_id: 'stateless-server',
          server_name: 'Stateless MCP Server',
          session_model: 'stateless-handle',
          handle_expiry_policy: 'short-lived',
          tools: [{ tool_id: 't1', tool_name: 'tool_one' }],
        },
      ],
      attestation: {
        generator: 'test',
        auth: {
          audience_bound_token_validated: true,
          pkce_used: true,
          per_client_consent_verified: false,
        },
      },
    };
    const result = validateMCPPosture(posture);
    expect(result.valid).toBe(true);
  });
});

describe('schema covers all fields from posture-model-v0.1.md', () => {
  it('has top-level fields: identity, servers, permission_graph, risk_summary, drift, attestation', () => {
    const schemaPath = join(__dirname, '../../../specs/mcp-posture/schema.json');
    const raw = readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(raw);

    const props = schema.properties;
    expect(props).toHaveProperty('identity');
    expect(props).toHaveProperty('servers');
    expect(props).toHaveProperty('permission_graph');
    expect(props).toHaveProperty('risk_summary');
    expect(props).toHaveProperty('drift');
    expect(props).toHaveProperty('attestation');
  });

  it('requires posture_version, identity, servers, and attestation', () => {
    const schemaPath = join(__dirname, '../../../specs/mcp-posture/schema.json');
    const raw = readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(raw);

    const required = schema.required as string[];
    expect(required).toContain('posture_version');
    expect(required).toContain('identity');
    expect(required).toContain('servers');
    expect(required).toContain('attestation');
  });
});

describe('example file validation', () => {
  const examplePath = join(__dirname, '../../../examples/mcp-risk-demo/posture.json');
  interface ExampleTool {
    risk_severity?: string;
  }
  interface ExampleServer {
    tools?: ExampleTool[];
  }
  let exampleData: { servers: ExampleServer[] };

  function loadExample() {
    const raw = readFileSync(examplePath, 'utf-8');
    exampleData = JSON.parse(raw);
  }

  it('validates examples/mcp-risk-demo/posture.json', () => {
    loadExample();
    const result = validateMCPPosture(exampleData);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('has at least 2 MCP servers', () => {
    loadExample();
    expect(exampleData.servers.length).toBeGreaterThanOrEqual(2);
  });

  it('has at least one tool with high risk severity', () => {
    loadExample();
    const highRiskTools = exampleData.servers.flatMap(
      (server) => server.tools?.filter((t) => t.risk_severity === 'high') ?? [],
    );
    expect(highRiskTools.length).toBeGreaterThanOrEqual(1);
  });

  it('includes a non-empty permission_graph', () => {
    loadExample();
    expect(exampleData.permission_graph).toBeDefined();
    expect(exampleData.permission_graph).not.toEqual({});
  });

  it('includes at least 2 risk_summary entries', () => {
    loadExample();
    expect(exampleData.risk_summary.length).toBeGreaterThanOrEqual(2);
  });
});

describe('inspectMCPPosture', () => {
  it('produces human-readable output', () => {
    const output = inspectMCPPosture(VALID_POSTURE);
    expect(output).toContain('MCP Posture v0.1');
    expect(output).toContain('posture-test-001');
    expect(output).toContain('test-agent-001');
    expect(output).toContain('Servers:');
  });

  it('shows protocol_version in output', () => {
    const posture = { ...VALID_POSTURE, protocol_version: '2026-07-28' };
    const output = inspectMCPPosture(posture);
    expect(output).toContain('2026-07-28');
  });

  it('shows owasp_agentic_ref in critical finding output', () => {
    const posture = {
      ...VALID_POSTURE,
      risk_summary: [
        {
          finding_id: 'f-001',
          severity: 'critical',
          category: 'prompt_injection',
          description: 'Tool poisoning detected',
          owasp_agentic_ref: 'ASI01',
        },
      ],
    };
    const output = inspectMCPPosture(posture);
    expect(output).toContain('ASI01');
  });
});

describe('diffMCPPosture', () => {
  it('returns empty diff for identical posture snapshots', () => {
    const diff = diffMCPPosture(VALID_POSTURE, { ...VALID_POSTURE });
    expect(diff.isEmpty()).toBe(true);
  });

  it('detects added servers', () => {
    const newPosture = {
      ...VALID_POSTURE,
      servers: [
        ...VALID_POSTURE.servers,
        {
          server_id: 'new-server',
          server_name: 'New Server',
          tools: [],
        },
      ],
    };
    const diff = diffMCPPosture(VALID_POSTURE, newPosture);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.servers.added).toContain('new-server');
  });

  it('detects removed servers', () => {
    const newPosture = {
      ...VALID_POSTURE,
      servers: [],
    };
    const diff = diffMCPPosture(VALID_POSTURE, newPosture);
    expect(diff.isEmpty()).toBe(false);
    expect(diff.servers.removed).toContain('test-server');
  });

  it('detects added and removed tools', () => {
    const newPosture = {
      ...VALID_POSTURE,
      servers: [
        {
          server_id: 'test-server',
          server_name: 'Test Server',
          tools: [
            {
              tool_id: 'new-tool',
              tool_name: 'new_tool',
              permissions: ['fs:read'],
              risk_categories: ['credential_access'],
              risk_severity: 'medium',
            },
          ],
        },
      ],
    };
    const diff = diffMCPPosture(VALID_POSTURE, newPosture);
    expect(diff.tools.added).toHaveLength(1);
    expect(diff.tools.added[0].tool.tool_id).toBe('new-tool');
    expect(diff.tools.removed).toHaveLength(1);
    expect(diff.tools.removed[0].tool.tool_id).toBe('test-tool');
  });

  it('detects permission changes', () => {
    const oldPosture = {
      ...VALID_POSTURE,
      permission_graph: {
        permission_scopes: ['network:outbound'],
      },
    };
    const newPosture = {
      ...VALID_POSTURE,
      permission_graph: {
        permission_scopes: ['network:outbound', 'fs:read'],
      },
    };
    const diff = diffMCPPosture(oldPosture, newPosture);
    expect(diff.permissions.added).toContain('fs:read');
  });

  it('detects risk findings added, removed, and modified', () => {
    const oldPosture = {
      ...VALID_POSTURE,
      risk_summary: [
        { finding_id: 'f-001', severity: 'low', category: 'ssrf', description: 'Old finding' },
      ],
    };
    const newPosture = {
      ...VALID_POSTURE,
      risk_summary: [
        { finding_id: 'f-001', severity: 'high', category: 'ssrf', description: 'Old finding' },
        {
          finding_id: 'f-002',
          severity: 'medium',
          category: 'exfiltration',
          description: 'New finding',
        },
      ],
    };
    const diff = diffMCPPosture(oldPosture, newPosture);
    expect(diff.risks.modified).toHaveLength(1);
    expect(diff.risks.modified[0].finding_id).toBe('f-001');
    expect(diff.risks.modified[0].field).toBe('severity');
    expect(diff.risks.modified[0].old).toBe('low');
    expect(diff.risks.modified[0].new).toBe('high');
    expect(diff.risks.added).toHaveLength(1);
    expect(diff.risks.added[0].finding_id).toBe('f-002');
  });
});

describe('formatPostureDiff', () => {
  it('produces human-readable diff output', () => {
    const newPosture = {
      ...VALID_POSTURE,
      servers: [
        {
          server_id: 'test-server',
          server_name: 'Test Server',
          tools: [
            {
              tool_id: 'test-tool',
              tool_name: 'test_tool',
              permissions: ['network:outbound'],
              risk_categories: ['ssrf'],
              risk_severity: 'low',
            },
          ],
        },
        {
          server_id: 'added-server',
          server_name: 'Added Server',
          tools: [],
        },
      ],
    };
    const diff = diffMCPPosture(VALID_POSTURE, newPosture);
    const output = formatPostureDiff(diff);
    expect(output).toContain('Servers added');
    expect(output).toContain('added-server');
  });

  it('reports no differences for empty diff', () => {
    const diff = diffMCPPosture(VALID_POSTURE, { ...VALID_POSTURE });
    const output = formatPostureDiff(diff);
    expect(output).toContain('No differences found');
  });
});

describe('diff with example drift fixtures', () => {
  const oldPath = join(__dirname, '../../../examples/mcp-risk-demo/posture-old.json');
  const newPath = join(__dirname, '../../../examples/mcp-risk-demo/posture-new.json');
  let oldData: Record<string, unknown>;
  let newData: Record<string, unknown>;

  it('diff detects server addition (local-filesystem)', () => {
    oldData = JSON.parse(readFileSync(oldPath, 'utf-8'));
    newData = JSON.parse(readFileSync(newPath, 'utf-8'));
    const diff = diffMCPPosture(oldData, newData);
    expect(diff.servers.added).toContain('local-filesystem');
  });

  it('diff detects tool additions', () => {
    const diff = diffMCPPosture(oldData, newData);
    const addedToolIds = diff.tools.added.map((t) => t.tool.tool_id);
    expect(addedToolIds).toContain('create-issue');
    expect(addedToolIds).toContain('read-file');
    expect(addedToolIds).toContain('write-file');
  });

  it('diff detects permission expansion', () => {
    const diff = diffMCPPosture(oldData, newData);
    expect(diff.permissions.added).toContain('fs:read');
    expect(diff.permissions.added).toContain('fs:write');
  });

  it('diff is not empty', () => {
    const diff = diffMCPPosture(oldData, newData);
    expect(diff.isEmpty()).toBe(false);
  });
});
