// ─────────────────────────────────────────────────────────────
// MCP Posture schema types (v0.1 + MCP 2026-07-28 additions)
// ─────────────────────────────────────────────────────────────

/** Session architecture model — MCP 2026-07-28 replaces stateful sessions with portable handles. */
export type SessionModel = "stateful" | "stateless-handle" | "unknown";

/** Handle expiry semantics for stateless-handle session_model servers. */
export type HandleExpiryPolicy = "short-lived" | "long-lived" | "unset";

/** OWASP MCP reference IDs (MCP-01 through MCP-07). */
export type OwaspMcpRef = `MCP-${string}`;

/** OWASP Agentic Applications Top 10 (2026) reference IDs (ASI01–ASI10). */
export type OwaspAgenticRef = `ASI${string}`;

/** All risk category tags. */
export type RiskCategory =
  | "ssrf"
  | "exfiltration"
  | "command_execution"
  | "privilege_escalation"
  | "prompt_injection"
  | "credential_access"
  | "supply_chain"
  | "mcp_header_leakage";

export type RiskSeverity = "critical" | "high" | "medium" | "low" | "info";

/** OAuth 2.0 audience-bound token validation fields per MCP 2026-07-28 security guidance. */
export interface AttestationAuth {
  audience_bound_token_validated?: boolean;
  pkce_used?: boolean;
  per_client_consent_verified?: boolean;
}

export interface PostureIdentity {
  snapshot_id: string;
  agent_id: string;
  captured_at: string;
  previous_snapshot_id?: string;
}

export interface PostureTool {
  tool_id: string;
  tool_name: string;
  permissions?: string[];
  risk_categories?: RiskCategory[];
  risk_severity?: RiskSeverity;
}

export interface PostureServer {
  server_id: string;
  server_name: string;
  version?: string;
  provenance?: "verified" | "unverified" | "unknown";
  session_model?: SessionModel;
  handle_expiry_policy?: HandleExpiryPolicy;
  tools: PostureTool[];
}

export interface RiskFinding {
  finding_id: string;
  severity: RiskSeverity;
  category: RiskCategory;
  description: string;
  tool_id?: string;
  owasp_mcp_ref?: string;
  owasp_agentic_ref?: OwaspAgenticRef;
}

export interface PermissionGraph {
  total_tools?: number;
  total_permissions?: number;
  high_risk_tools?: number;
  permission_scopes?: string[];
}

export interface PostureDrift {
  servers_added?: string[];
  servers_removed?: string[];
  tools_added?: string[];
  tools_removed?: string[];
  permissions_expanded?: string[];
  permissions_reduced?: string[];
}

export interface Attestation {
  generator: string;
  snapshot_hash?: string;
  auth?: AttestationAuth;
}

/** Full MCP Posture snapshot. */
export interface MCPPostureSnapshot {
  posture_version: "0.1";
  protocol_version?: "2026-07-28" | "2025-03-26";
  identity: PostureIdentity;
  servers: PostureServer[];
  permission_graph?: PermissionGraph;
  risk_summary?: RiskFinding[];
  drift?: PostureDrift;
  attestation: Attestation;
}

// ─────────────────────────────────────────────────────────────
// Zod schema (inline, no external dependency)
// ─────────────────────────────────────────────────────────────

const SESSION_MODELS = ["stateful", "stateless-handle", "unknown"] as const;
const HANDLE_EXPIRY_POLICIES = ["short-lived", "long-lived", "unset"] as const;
const RISK_CATEGORIES = [
  "ssrf",
  "exfiltration",
  "command_execution",
  "privilege_escalation",
  "prompt_injection",
  "credential_access",
  "supply_chain",
  "mcp_header_leakage",
] as const;
const RISK_SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

/** Lightweight Zod-like validation — no runtime dependency on the zod package. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const POSTURE_REQUIRED = ["posture_version", "identity", "servers", "attestation"] as const;
const IDENTITY_REQUIRED = ["snapshot_id", "agent_id", "captured_at"] as const;

export function validateMCPPosture(data: unknown): ValidationResult {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, errors: ["root must be an object"] };
  }
  const d = data as Record<string, unknown>;
  const errors: string[] = [];

  errors.push(...POSTURE_REQUIRED.filter((k) => !(k in d)).map((k) => `missing required: ${k}`));

  if ("posture_version" in d && d.posture_version !== "0.1") {
    errors.push(`posture_version must be "0.1"`);
  }

  if ("protocol_version" in d) {
    const pv = d.protocol_version as string;
    if (pv !== "2026-07-28" && pv !== "2025-03-26") {
      errors.push(`protocol_version must be "2026-07-28" or "2025-03-26"`);
    }
  }

  if (d.identity && typeof d.identity === "object") {
    const id = d.identity as Record<string, unknown>;
    errors.push(...IDENTITY_REQUIRED.filter((k) => !(k in id)).map((k) => `identity: missing ${k}`));
  }

  // Validate session_model values if present in any server
  if (Array.isArray(d.servers)) {
    for (const server of d.servers) {
      if (typeof server !== "object" || server === null) continue;
      const s = server as Record<string, unknown>;
      if ("session_model" in s) {
        const sm = s.session_model as string;
        if (!SESSION_MODELS.includes(sm as (typeof SESSION_MODELS)[number])) {
          errors.push(
            `server "${s.server_id ?? "?"}": session_model must be one of ${SESSION_MODELS.join(", ")}`,
          );
        }
      }
      if ("handle_expiry_policy" in s) {
        const hep = s.handle_expiry_policy as string;
        if (!HANDLE_EXPIRY_POLICIES.includes(hep as (typeof HANDLE_EXPIRY_POLICIES)[number])) {
          errors.push(
            `server "${s.server_id ?? "?"}": handle_expiry_policy must be one of ${HANDLE_EXPIRY_POLICIES.join(", ")}`,
          );
        }
      }
      // Validate tool risk_categories
      if (Array.isArray(s.tools)) {
        for (const tool of s.tools) {
          if (typeof tool !== "object" || tool === null) continue;
          const t = tool as Record<string, unknown>;
          if (Array.isArray(t.risk_categories)) {
            for (const cat of t.risk_categories) {
              if (typeof cat === "string" && !RISK_CATEGORIES.includes(cat as (typeof RISK_CATEGORIES)[number])) {
                errors.push(
                  `tool "${t.tool_id ?? "?"}": risk_category "${cat}" is not a known category`,
                );
              }
            }
          }
        }
      }
    }
  }

  // Validate attestation.auth fields types if present
  if (d.attestation && typeof d.attestation === "object") {
    const att = d.attestation as Record<string, unknown>;
    if (att.auth && typeof att.auth === "object") {
      const auth = att.auth as Record<string, unknown>;
      for (const key of ["audience_bound_token_validated", "pkce_used", "per_client_consent_verified"]) {
        if (key in auth && typeof auth[key] !== "boolean") {
          errors.push(`attestation.auth.${key} must be a boolean`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Re-exported for consumers who want category lists without importing the types. */
export { RISK_CATEGORIES, RISK_SEVERITIES, SESSION_MODELS, HANDLE_EXPIRY_POLICIES };

// ─────────────────────────────────────────────────────────────
// Inspect / human-readable output
// ─────────────────────────────────────────────────────────────

export function inspectMCPPosture(data: Record<string, unknown>): string {
  const identity = data.identity as Record<string, string> | undefined;
  const servers = (data.servers as Record<string, unknown>[]) ?? [];
  const risks = (data.risk_summary as Record<string, string>[]) ?? [];
  const permissionGraph = data.permission_graph as Record<string, unknown> | undefined;
  const protocolVersion = data.protocol_version as string | undefined;

  const totalTools = servers.reduce(
    (sum, s) => sum + ((s.tools as unknown[]) ?? []).length,
    0,
  );

  const highRiskTools =
    (permissionGraph?.high_risk_tools as number) ??
    servers.reduce(
      (sum, s) =>
        sum +
        ((s.tools as Record<string, string>[]) ?? []).filter(
          (t) => t.risk_severity === "critical" || t.risk_severity === "high",
        ).length,
      0,
    );

  const lines: string[] = [
    `MCP Posture v${data.posture_version}${protocolVersion ? ` (${protocolVersion})` : ""}`,
    `  Snapshot:        ${identity?.snapshot_id ?? "?"}`,
    `  Agent:           ${identity?.agent_id ?? "?"}`,
    `  Servers:         ${servers.length}`,
    `  Tools:           ${totalTools}`,
    `  High-risk tools: ${highRiskTools}`,
    `  Risks:           ${risks.length}`,
  ];

  // Show session model summary
  const statelessServers = servers.filter((s) => s.session_model === "stateless-handle");
  if (statelessServers.length > 0) {
    lines.push(`  Stateless-handle servers: ${statelessServers.length}`);
  }

  const criticalOrHigh = risks.filter(
    (r) => r.severity === "critical" || r.severity === "high",
  );

  if (criticalOrHigh.length > 0) {
    lines.push("");
    lines.push(`  ⚠  ${criticalOrHigh.length} critical/high finding(s):`);
    for (const r of criticalOrHigh) {
      const agentic = r.owasp_agentic_ref ? ` [${r.owasp_agentic_ref}]` : "";
      lines.push(`    [${r.severity.toUpperCase()}] ${r.finding_id}: ${r.description}${agentic}`);
    }
  }

  if (risks.length > 0 && criticalOrHigh.length < risks.length) {
    const other = risks.filter(
      (r) => r.severity !== "critical" && r.severity !== "high",
    );
    lines.push("");
    lines.push("  Other findings:");
    for (const r of other) {
      lines.push(`    [${r.severity.toUpperCase()}] ${r.finding_id}: ${r.description}`);
    }
  }

  return lines.join("\n");
}
