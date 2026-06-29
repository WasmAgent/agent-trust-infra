export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const AGENTBOM_REQUIRED = ["agentbom_version", "identity", "attestation"] as const;
const IDENTITY_REQUIRED = ["agent_id", "agent_name", "generated_at"] as const;
const VALID_VERSIONS = ["0.1"];

export function validateAgentBOM(data: unknown): ValidationResult {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, errors: ["root must be an object"] };
  }
  const d = data as Record<string, unknown>;
  const errors: string[] = [];

  errors.push(...AGENTBOM_REQUIRED.filter((k) => !(k in d)).map((k) => `missing required: ${k}`));

  if ("agentbom_version" in d && !VALID_VERSIONS.includes(d.agentbom_version as string)) {
    errors.push(`agentbom_version must be one of: ${VALID_VERSIONS.join(", ")}`);
  }

  if (d.identity && typeof d.identity === "object") {
    const id = d.identity as Record<string, unknown>;
    errors.push(...IDENTITY_REQUIRED.filter((k) => !(k in id)).map((k) => `identity: missing ${k}`));
  }

  return { valid: errors.length === 0, errors };
}

export function inspectAgentBOM(data: Record<string, unknown>): string {
  const identity = data.identity as Record<string, string> | undefined;
  const toolLayer = (data.tool_layer as unknown[]) ?? [];
  const riskLayer = (data.risk_layer as unknown[]) ?? [];
  return [
    `AgentBOM v${data.agentbom_version}`,
    `  Agent:   ${identity?.agent_name ?? "unknown"} (${identity?.agent_id ?? "?"})`,
    `  Context: ${identity?.deployment_context ?? "unset"}`,
    `  Tools:   ${toolLayer.length}`,
    `  Risks:   ${riskLayer.length}`,
  ].join("\n");
}

// --- AgentBOM Diff types and logic ---

export interface ToolEntry {
  tool_id: string;
  tool_name: string;
  source: string;
  permissions?: string[];
  risk_signals?: string[];
}

export interface ToolModification {
  tool_id: string;
  field: string;
  old: string;
  new: string;
}

export interface RiskEntry {
  risk_id: string;
  severity: string;
  category: string;
  description: string;
  status?: string;
}

export interface RiskModification {
  risk_id: string;
  field: string;
  old: string;
  new: string;
}

export interface AgentBOMDiff {
  tools: {
    added: ToolEntry[];
    removed: ToolEntry[];
    modified: ToolModification[];
  };
  permissions: {
    added: string[];
    removed: string[];
  };
  risks: {
    added: RiskEntry[];
    removed: RiskEntry[];
    modified: RiskModification[];
  };
  isEmpty(): boolean;
}

export function createAgentBOMDiff(partial: Omit<AgentBOMDiff, "isEmpty">): AgentBOMDiff {
  const isEmpty = (): boolean =>
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

function parseTools(toolLayer: unknown): Map<string, ToolEntry> {
  const tools = new Map<string, ToolEntry>();
  for (const item of toArray(toolLayer)) {
    if (typeof item === "object" && item !== null) {
      const t = item as Record<string, unknown>;
      if (typeof t.tool_id === "string") {
        tools.set(t.tool_id, {
          tool_id: t.tool_id,
          tool_name: String(t.tool_name ?? ""),
          source: String(t.source ?? ""),
          permissions: toArray(t.permissions).map(String),
          risk_signals: toArray(t.risk_signals).map(String),
        });
      }
    }
  }
  return tools;
}

function parseRisks(riskLayer: unknown): Map<string, RiskEntry> {
  const risks = new Map<string, RiskEntry>();
  for (const item of toArray(riskLayer)) {
    if (typeof item === "object" && item !== null) {
      const r = item as Record<string, unknown>;
      if (typeof r.risk_id === "string") {
        risks.set(r.risk_id, {
          risk_id: r.risk_id,
          severity: String(r.severity ?? ""),
          category: String(r.category ?? ""),
          description: String(r.description ?? ""),
          status: String(r.status ?? ""),
        });
      }
    }
  }
  return risks;
}

function diffStringArrays(oldArr: string[], newArr: string[]): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  const added = newArr.filter((s) => !oldSet.has(s));
  const removed = oldArr.filter((s) => !newSet.has(s));
  return { added, removed };
}

export function diffAgentBOM(oldData: Record<string, unknown>, newData: Record<string, unknown>): AgentBOMDiff {
  const oldTools = parseTools(oldData.tool_layer);
  const newTools = parseTools(newData.tool_layer);

  const toolsAdded: ToolEntry[] = [];
  const toolsRemoved: ToolEntry[] = [];
  const toolsModified: ToolModification[] = [];

  for (const [id, tool] of newTools) {
    if (!oldTools.has(id)) {
      toolsAdded.push(tool);
    }
  }
  for (const [id, tool] of oldTools) {
    if (!newTools.has(id)) {
      toolsRemoved.push(tool);
    }
  }
  for (const [id, newTool] of newTools) {
    const oldTool = oldTools.get(id);
    if (!oldTool) continue;

    const permDiff = diffStringArrays(oldTool.permissions ?? [], newTool.permissions ?? []);
    for (const p of permDiff.added) {
      toolsModified.push({ tool_id: id, field: "permissions", old: "", new: p });
    }
    for (const p of permDiff.removed) {
      toolsModified.push({ tool_id: id, field: "permissions", old: p, new: "" });
    }

    if (oldTool.tool_name !== newTool.tool_name) {
      toolsModified.push({ tool_id: id, field: "tool_name", old: oldTool.tool_name, new: newTool.tool_name });
    }
    if (oldTool.source !== newTool.source) {
      toolsModified.push({ tool_id: id, field: "source", old: oldTool.source, new: newTool.source });
    }
  }

  const oldPerms = toArray(
    (oldData.permission_layer as Record<string, unknown> | undefined)?.granted_scopes,
  ).map(String);
  const newPerms = toArray(
    (newData.permission_layer as Record<string, unknown> | undefined)?.granted_scopes,
  ).map(String);
  const permChanges = diffStringArrays(oldPerms, newPerms);

  const oldRisks = parseRisks(oldData.risk_layer);
  const newRisks = parseRisks(newData.risk_layer);

  const risksAdded: RiskEntry[] = [];
  const risksRemoved: RiskEntry[] = [];
  const risksModified: RiskModification[] = [];

  for (const [id, risk] of newRisks) {
    if (!oldRisks.has(id)) {
      risksAdded.push(risk);
    }
  }
  for (const [id, risk] of oldRisks) {
    if (!newRisks.has(id)) {
      risksRemoved.push(risk);
    }
  }
  for (const [id, newRisk] of newRisks) {
    const oldRisk = oldRisks.get(id);
    if (!oldRisk) continue;

    if (oldRisk.severity !== newRisk.severity) {
      risksModified.push({ risk_id: id, field: "severity", old: oldRisk.severity, new: newRisk.severity });
    }
    if (oldRisk.status !== newRisk.status) {
      risksModified.push({ risk_id: id, field: "status", old: oldRisk.status, new: newRisk.status });
    }
    if (oldRisk.category !== newRisk.category) {
      risksModified.push({ risk_id: id, field: "category", old: oldRisk.category, new: newRisk.category });
    }
  }

  return createAgentBOMDiff({
    tools: { added: toolsAdded, removed: toolsRemoved, modified: toolsModified },
    permissions: { added: permChanges.added, removed: permChanges.removed },
    risks: { added: risksAdded, removed: risksRemoved, modified: risksModified },
  });
}

export function formatAgentBOMDiff(diff: AgentBOMDiff): string {
  const lines: string[] = [];

  if (diff.tools.added.length > 0) {
    lines.push(`Tools added (${diff.tools.added.length}):`);
    for (const t of diff.tools.added) {
      lines.push(`  + ${t.tool_name} (${t.tool_id}) [${t.source}]`);
    }
  }

  if (diff.tools.removed.length > 0) {
    lines.push(`Tools removed (${diff.tools.removed.length}):`);
    for (const t of diff.tools.removed) {
      lines.push(`  - ${t.tool_name} (${t.tool_id}) [${t.source}]`);
    }
  }

  if (diff.tools.modified.length > 0) {
    lines.push(`Tools changed (${diff.tools.modified.length}):`);
    for (const m of diff.tools.modified) {
      if (m.field === "permissions") {
        if (m.new) {
          lines.push(`  ~ ${m.tool_id}: permission added: ${m.new}`);
        } else {
          lines.push(`  ~ ${m.tool_id}: permission removed: ${m.old}`);
        }
      } else {
        lines.push(`  ~ ${m.tool_id}: ${m.field}: ${m.old} → ${m.new}`);
      }
    }
  }

  if (diff.permissions.added.length > 0) {
    lines.push(`Permission scopes added (${diff.permissions.added.length}):`);
    for (const s of diff.permissions.added) {
      lines.push(`  + ${s}`);
    }
  }

  if (diff.permissions.removed.length > 0) {
    lines.push(`Permission scopes removed (${diff.permissions.removed.length}):`);
    for (const s of diff.permissions.removed) {
      lines.push(`  - ${s}`);
    }
  }

  if (diff.risks.added.length > 0) {
    lines.push(`Risk entries added (${diff.risks.added.length}):`);
    for (const r of diff.risks.added) {
      lines.push(`  + [${r.severity}] ${r.risk_id}: ${r.description}`);
    }
  }

  if (diff.risks.removed.length > 0) {
    lines.push(`Risk entries removed (${diff.risks.removed.length}):`);
    for (const r of diff.risks.removed) {
      lines.push(`  - [${r.severity}] ${r.risk_id}: ${r.description}`);
    }
  }

  if (diff.risks.modified.length > 0) {
    lines.push(`Risk entries changed (${diff.risks.modified.length}):`);
    for (const m of diff.risks.modified) {
      lines.push(`  ~ ${m.risk_id}: ${m.field}: ${m.old} → ${m.new}`);
    }
  }

  if (lines.length === 0) {
    lines.push("No differences found between the two AgentBOMs.");
  }

  return lines.join("\n");
}
