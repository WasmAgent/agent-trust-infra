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
