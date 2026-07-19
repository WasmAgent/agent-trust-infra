export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const POSTURE_REQUIRED = ['posture_version', 'identity', 'servers', 'attestation'] as const;
const IDENTITY_REQUIRED = ['snapshot_id', 'agent_id', 'captured_at'] as const;

export const RISK_CATEGORIES = [
  'ssrf',
  'exfiltration',
  'command_execution',
  'privilege_escalation',
  'prompt_injection',
  'credential_access',
  'supply_chain',
  'mcp_header_leakage',
] as const;

export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export type SessionModel = 'stateful' | 'stateless-handle' | 'unknown';
export type HandleExpiryPolicy = 'short-lived' | 'long-lived' | 'unset';

export interface McpPostureAuth {
  audience_bound_token_validated?: boolean;
  pkce_used?: boolean;
  per_client_consent_verified?: boolean;
}

// --- Diff types and logic ---

interface ServerEntry {
  server_id: string;
  server_name: string;
  tools: Map<string, ToolEntry>;
}

interface ToolEntry {
  tool_id: string;
  tool_name: string;
  permissions: string[];
  risk_categories: string[];
  risk_severity: string;
}

interface RiskEntry {
  finding_id: string;
  severity: string;
  category: string;
  description: string;
}

export interface PostureDiff {
  servers: {
    added: string[];
    removed: string[];
  };
  tools: {
    added: { server_id: string; tool: ToolEntry }[];
    removed: { server_id: string; tool: ToolEntry }[];
    modified: { server_id: string; tool_id: string; field: string; old: string; new: string }[];
  };
  permissions: {
    added: string[];
    removed: string[];
  };
  risks: {
    added: RiskEntry[];
    removed: RiskEntry[];
    modified: { finding_id: string; field: string; old: string; new: string }[];
  };
  isEmpty(): boolean;
}

export function createPostureDiff(partial: Omit<PostureDiff, 'isEmpty'>): PostureDiff {
  const isEmpty = (): boolean =>
    partial.servers.added.length === 0 &&
    partial.servers.removed.length === 0 &&
    partial.tools.added.length === 0 &&
    partial.tools.removed.length === 0 &&
    partial.tools.modified.length === 0 &&
    partial.permissions.added.length === 0 &&
    partial.permissions.removed.length === 0 &&
    partial.risks.added.length === 0 &&
    partial.risks.removed.length === 0 &&
    partial.risks.modified.length === 0;

  return { ...partial, isEmpty };
}

function toArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

function parseServers(servers: unknown): Map<string, ServerEntry> {
  const map = new Map<string, ServerEntry>();
  for (const item of toArray(servers)) {
    if (typeof item === 'object' && item !== null) {
      const s = item as Record<string, unknown>;
      if (typeof s.server_id === 'string') {
        const tools = new Map<string, ToolEntry>();
        for (const t of toArray(s.tools)) {
          if (typeof t === 'object' && t !== null) {
            const tool = t as Record<string, unknown>;
            if (typeof tool.tool_id === 'string') {
              tools.set(tool.tool_id, {
                tool_id: tool.tool_id,
                tool_name: String(tool.tool_name ?? ''),
                permissions: toArray(tool.permissions).map(String),
                risk_categories: toArray(tool.risk_categories).map(String),
                risk_severity: String(tool.risk_severity ?? ''),
              });
            }
          }
        }
        map.set(s.server_id, {
          server_id: s.server_id,
          server_name: String(s.server_name ?? ''),
          tools,
        });
      }
    }
  }
  return map;
}

function parseRisks(riskSummary: unknown): Map<string, RiskEntry> {
  const map = new Map<string, RiskEntry>();
  for (const item of toArray(riskSummary)) {
    if (typeof item === 'object' && item !== null) {
      const r = item as Record<string, unknown>;
      if (typeof r.finding_id === 'string') {
        map.set(r.finding_id, {
          finding_id: r.finding_id,
          severity: String(r.severity ?? ''),
          category: String(r.category ?? ''),
          description: String(r.description ?? ''),
        });
      }
    }
  }
  return map;
}

function diffStringArrays(
  oldArr: string[],
  newArr: string[],
): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  return {
    added: newArr.filter((s) => !oldSet.has(s)),
    removed: oldArr.filter((s) => !newSet.has(s)),
  };
}

export function diffMCPPosture(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
): PostureDiff {
  const oldServers = parseServers(oldData.servers);
  const newServers = parseServers(newData.servers);

  const serversAdded: string[] = [];
  const serversRemoved: string[] = [];
  const toolsAdded: { server_id: string; tool: ToolEntry }[] = [];
  const toolsRemoved: { server_id: string; tool: ToolEntry }[] = [];
  const toolsModified: {
    server_id: string;
    tool_id: string;
    field: string;
    old: string;
    new: string;
  }[] = [];

  for (const [id, server] of newServers) {
    if (!oldServers.has(id)) {
      serversAdded.push(id);
      for (const [, tool] of server.tools) {
        toolsAdded.push({ server_id: id, tool });
      }
    }
  }
  for (const [id, server] of oldServers) {
    if (!newServers.has(id)) {
      serversRemoved.push(id);
      for (const [, tool] of server.tools) {
        toolsRemoved.push({ server_id: id, tool });
      }
    }
  }
  for (const [id, newServer] of newServers) {
    const oldServer = oldServers.get(id);
    if (!oldServer) continue;

    for (const [toolId, newTool] of newServer.tools) {
      if (!oldServer.tools.has(toolId)) {
        toolsAdded.push({ server_id: id, tool: newTool });
      }
    }
    for (const [toolId, oldTool] of oldServer.tools) {
      if (!newServer.tools.has(toolId)) {
        toolsRemoved.push({ server_id: id, tool: oldTool });
      }
    }
    for (const [toolId, newTool] of newServer.tools) {
      const oldTool = oldServer.tools.get(toolId);
      if (!oldTool) continue;

      const permDiff = diffStringArrays(oldTool.permissions, newTool.permissions);
      for (const p of permDiff.added) {
        toolsModified.push({
          server_id: id,
          tool_id: toolId,
          field: 'permissions',
          old: '',
          new: p,
        });
      }
      for (const p of permDiff.removed) {
        toolsModified.push({
          server_id: id,
          tool_id: toolId,
          field: 'permissions',
          old: p,
          new: '',
        });
      }

      const catDiff = diffStringArrays(oldTool.risk_categories, newTool.risk_categories);
      for (const c of catDiff.added) {
        toolsModified.push({
          server_id: id,
          tool_id: toolId,
          field: 'risk_category',
          old: '',
          new: c,
        });
      }
      for (const c of catDiff.removed) {
        toolsModified.push({
          server_id: id,
          tool_id: toolId,
          field: 'risk_category',
          old: c,
          new: '',
        });
      }

      if (oldTool.risk_severity !== newTool.risk_severity) {
        toolsModified.push({
          server_id: id,
          tool_id: toolId,
          field: 'risk_severity',
          old: oldTool.risk_severity,
          new: newTool.risk_severity,
        });
      }
    }
  }

  // Permission scope diff from permission_graph
  const oldScopes = toArray(
    (oldData.permission_graph as Record<string, unknown> | undefined)?.permission_scopes,
  ).map(String);
  const newScopes = toArray(
    (newData.permission_graph as Record<string, unknown> | undefined)?.permission_scopes,
  ).map(String);
  const permChanges = diffStringArrays(oldScopes, newScopes);

  // Risk summary diff
  const oldRisks = parseRisks(oldData.risk_summary);
  const newRisks = parseRisks(newData.risk_summary);

  const risksAdded: RiskEntry[] = [];
  const risksRemoved: RiskEntry[] = [];
  const risksModified: { finding_id: string; field: string; old: string; new: string }[] = [];

  for (const [id, risk] of newRisks) {
    if (!oldRisks.has(id)) risksAdded.push(risk);
  }
  for (const [id, risk] of oldRisks) {
    if (!newRisks.has(id)) risksRemoved.push(risk);
  }
  for (const [id, newRisk] of newRisks) {
    const oldRisk = oldRisks.get(id);
    if (!oldRisk) continue;
    if (oldRisk.severity !== newRisk.severity) {
      risksModified.push({
        finding_id: id,
        field: 'severity',
        old: oldRisk.severity,
        new: newRisk.severity,
      });
    }
    if (oldRisk.category !== newRisk.category) {
      risksModified.push({
        finding_id: id,
        field: 'category',
        old: oldRisk.category,
        new: newRisk.category,
      });
    }
    if (oldRisk.description !== newRisk.description) {
      risksModified.push({
        finding_id: id,
        field: 'description',
        old: oldRisk.description,
        new: newRisk.description,
      });
    }
  }

  return createPostureDiff({
    servers: { added: serversAdded, removed: serversRemoved },
    tools: { added: toolsAdded, removed: toolsRemoved, modified: toolsModified },
    permissions: { added: permChanges.added, removed: permChanges.removed },
    risks: { added: risksAdded, removed: risksRemoved, modified: risksModified },
  });
}

export function formatPostureDiff(diff: PostureDiff): string {
  const lines: string[] = [];

  if (diff.servers.added.length > 0) {
    lines.push(`Servers added (${diff.servers.added.length}):`);
    for (const s of diff.servers.added) lines.push(`  + ${s}`);
  }

  if (diff.servers.removed.length > 0) {
    lines.push(`Servers removed (${diff.servers.removed.length}):`);
    for (const s of diff.servers.removed) lines.push(`  - ${s}`);
  }

  if (diff.tools.added.length > 0) {
    lines.push(`Tools added (${diff.tools.added.length}):`);
    for (const t of diff.tools.added) {
      lines.push(`  + ${t.tool.tool_name} (${t.tool.tool_id}) [server: ${t.server_id}]`);
    }
  }

  if (diff.tools.removed.length > 0) {
    lines.push(`Tools removed (${diff.tools.removed.length}):`);
    for (const t of diff.tools.removed) {
      lines.push(`  - ${t.tool.tool_name} (${t.tool.tool_id}) [server: ${t.server_id}]`);
    }
  }

  if (diff.tools.modified.length > 0) {
    lines.push(`Tools changed (${diff.tools.modified.length}):`);
    for (const m of diff.tools.modified) {
      if (m.field === 'permissions' || m.field === 'risk_category') {
        if (m.new) {
          lines.push(`  ~ ${m.tool_id} (${m.server_id}): ${m.field} added: ${m.new}`);
        } else {
          lines.push(`  ~ ${m.tool_id} (${m.server_id}): ${m.field} removed: ${m.old}`);
        }
      } else {
        lines.push(`  ~ ${m.tool_id} (${m.server_id}): ${m.field}: ${m.old} → ${m.new}`);
      }
    }
  }

  if (diff.permissions.added.length > 0) {
    lines.push(`Permission scopes added (${diff.permissions.added.length}):`);
    for (const s of diff.permissions.added) lines.push(`  + ${s}`);
  }

  if (diff.permissions.removed.length > 0) {
    lines.push(`Permission scopes removed (${diff.permissions.removed.length}):`);
    for (const s of diff.permissions.removed) lines.push(`  - ${s}`);
  }

  if (diff.risks.added.length > 0) {
    lines.push(`Risk findings added (${diff.risks.added.length}):`);
    for (const r of diff.risks.added) {
      lines.push(`  + [${r.severity}] ${r.finding_id}: ${r.description}`);
    }
  }

  if (diff.risks.removed.length > 0) {
    lines.push(`Risk findings removed (${diff.risks.removed.length}):`);
    for (const r of diff.risks.removed) {
      lines.push(`  - [${r.severity}] ${r.finding_id}: ${r.description}`);
    }
  }

  if (diff.risks.modified.length > 0) {
    lines.push(`Risk findings changed (${diff.risks.modified.length}):`);
    for (const m of diff.risks.modified) {
      lines.push(`  ~ ${m.finding_id}: ${m.field}: ${m.old} → ${m.new}`);
    }
  }

  if (lines.length === 0) {
    lines.push('No differences found between the two posture snapshots.');
  }

  return lines.join('\n');
}

export function validateMCPPosture(data: unknown): ValidationResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['root must be an object'] };
  }
  const d = data as Record<string, unknown>;
  const errors: string[] = [];

  errors.push(...POSTURE_REQUIRED.filter((k) => !(k in d)).map((k) => `missing required: ${k}`));

  if ('posture_version' in d && d.posture_version !== '0.1') {
    errors.push(`posture_version must be "0.1"`);
  }

  if (d.identity && typeof d.identity === 'object') {
    const id = d.identity as Record<string, unknown>;
    errors.push(
      ...IDENTITY_REQUIRED.filter((k) => !(k in id)).map((k) => `identity: missing ${k}`),
    );
  }

  return { valid: errors.length === 0, errors };
}

export function inspectMCPPosture(data: Record<string, unknown>): string {
  const identity = data.identity as Record<string, string> | undefined;
  const servers = (data.servers as Record<string, unknown>[]) ?? [];
  const risks = (data.risk_summary as Record<string, string>[]) ?? [];
  const permissionGraph = data.permission_graph as Record<string, unknown> | undefined;
  const protocolVersion = (data.protocol_version as string | undefined) ?? 'pre-2026-07-28';

  const totalTools = servers.reduce((sum, s) => sum + ((s.tools as unknown[]) ?? []).length, 0);

  const highRiskTools =
    (permissionGraph?.high_risk_tools as number) ??
    servers.reduce(
      (sum, s) =>
        sum +
        ((s.tools as Record<string, string>[]) ?? []).filter(
          (t) => t.risk_severity === 'critical' || t.risk_severity === 'high',
        ).length,
      0,
    );

  const lines: string[] = [
    `MCP Posture v${data.posture_version} (protocol: ${protocolVersion})`,
    `  Snapshot:        ${identity?.snapshot_id ?? '?'}`,
    `  Agent:           ${identity?.agent_id ?? '?'}`,
    `  Servers:         ${servers.length}`,
    `  Tools:           ${totalTools}`,
    `  High-risk tools: ${highRiskTools}`,
    `  Risks:           ${risks.length}`,
  ];

  const criticalOrHigh = risks.filter((r) => r.severity === 'critical' || r.severity === 'high');

  if (criticalOrHigh.length > 0) {
    lines.push('');
    lines.push(`  ⚠  ${criticalOrHigh.length} critical/high finding(s):`);
    for (const r of criticalOrHigh) {
      const agenticRef = r.owasp_agentic_ref ? ` [${r.owasp_agentic_ref}]` : '';
      lines.push(
        `    [${r.severity.toUpperCase()}] ${r.finding_id}: ${r.description}${agenticRef}`,
      );
    }
  }

  if (risks.length > 0 && criticalOrHigh.length < risks.length) {
    const other = risks.filter((r) => r.severity !== 'critical' && r.severity !== 'high');
    lines.push('');
    lines.push('  Other findings:');
    for (const r of other) {
      lines.push(`    [${r.severity.toUpperCase()}] ${r.finding_id}: ${r.description}`);
    }
  }

  return lines.join('\n');
}
