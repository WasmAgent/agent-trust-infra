import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';

export interface ValidationError {
  /** Dot-notation path to the offending field, e.g. "identity.agent_id". "(root)" for the document itself. */
  field: string;
  /** Human-readable description of the failure. */
  message: string;
  /** AJV keyword that failed, e.g. "required", "enum", "type". */
  keyword: string;
}

export interface ValidationResult {
  valid: boolean;
  /** Human-readable error strings, each prefixed with the field path. */
  errors: string[];
  /** Structured errors with field paths. */
  errorDetails: ValidationError[];
}

// Schema lives at the repository root: <root>/specs/agentbom/schema.json
// This file is <root>/packages/agentbom-core/src/index.ts.
const SCHEMA_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../specs/agentbom/schema.json',
);

let validateSchema: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (validateSchema) return validateSchema;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
  validateSchema = ajv.compile(schema);
  return validateSchema;
}

/** Convert an AJV instancePath (JSON pointer) into a dot-notation field path. */
function toFieldPath(instancePath: string, extra?: string): string {
  let path = instancePath.startsWith('/') ? instancePath.slice(1) : instancePath;
  path = path.replace(/\//g, '.');
  if (extra) path = path ? `${path}.${extra}` : extra;
  return path || '(root)';
}

/** For errors that name a specific property, return it so it can be folded into the field path. */
function namedProperty(err: ErrorObject): string | undefined {
  if (err.keyword === 'required') {
    return (err.params as { missingProperty?: string } | undefined)?.missingProperty;
  }
  if (err.keyword === 'additionalProperties') {
    return (err.params as { additionalProperty?: string } | undefined)?.additionalProperty;
  }
  return undefined;
}

export function validateAgentBOM(data: unknown): ValidationResult {
  const validate = getValidator();

  let valid = false;
  try {
    valid = validate(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [`(root): schema validation crashed: ${message}`],
      errorDetails: [
        { field: '(root)', message: `schema validation crashed: ${message}`, keyword: 'exception' },
      ],
    };
  }

  const errorDetails: ValidationError[] = (validate.errors ?? []).map((err) => {
    const field = toFieldPath(err.instancePath, namedProperty(err));
    return {
      field,
      message: err.message ?? `failed constraint "${err.keyword}"`,
      keyword: err.keyword,
    };
  });
  const errors = errorDetails.map((e) => `${e.field}: ${e.message}`);

  return { valid, errors, errorDetails };
}

export function inspectAgentBOM(data: Record<string, unknown>): string {
  const identity = data.identity as Record<string, string> | undefined;
  const toolLayer = (data.tool_layer as unknown[]) ?? [];
  const riskLayer = (data.risk_layer as unknown[]) ?? [];
  return [
    `AgentBOM v${data.agentbom_version}`,
    `  Agent:   ${identity?.agent_name ?? 'unknown'} (${identity?.agent_id ?? '?'})`,
    `  Context: ${identity?.deployment_context ?? 'unset'}`,
    `  Tools:   ${toolLayer.length}`,
    `  Risks:   ${riskLayer.length}`,
  ].join('\n');
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

export function createAgentBOMDiff(partial: Omit<AgentBOMDiff, 'isEmpty'>): AgentBOMDiff {
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
    if (typeof item === 'object' && item !== null) {
      const t = item as Record<string, unknown>;
      if (typeof t.tool_id === 'string') {
        tools.set(t.tool_id, {
          tool_id: t.tool_id,
          tool_name: String(t.tool_name ?? ''),
          source: String(t.source ?? ''),
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
    if (typeof item === 'object' && item !== null) {
      const r = item as Record<string, unknown>;
      if (typeof r.risk_id === 'string') {
        risks.set(r.risk_id, {
          risk_id: r.risk_id,
          severity: String(r.severity ?? ''),
          category: String(r.category ?? ''),
          description: String(r.description ?? ''),
          status: String(r.status ?? ''),
        });
      }
    }
  }
  return risks;
}

function diffStringArrays(
  oldArr: string[],
  newArr: string[],
): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  const added = newArr.filter((s) => !oldSet.has(s));
  const removed = oldArr.filter((s) => !newSet.has(s));
  return { added, removed };
}

export function diffAgentBOM(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
): AgentBOMDiff {
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
      toolsModified.push({ tool_id: id, field: 'permissions', old: '', new: p });
    }
    for (const p of permDiff.removed) {
      toolsModified.push({ tool_id: id, field: 'permissions', old: p, new: '' });
    }

    if (oldTool.tool_name !== newTool.tool_name) {
      toolsModified.push({
        tool_id: id,
        field: 'tool_name',
        old: oldTool.tool_name,
        new: newTool.tool_name,
      });
    }
    if (oldTool.source !== newTool.source) {
      toolsModified.push({
        tool_id: id,
        field: 'source',
        old: oldTool.source,
        new: newTool.source,
      });
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
      risksModified.push({
        risk_id: id,
        field: 'severity',
        old: oldRisk.severity,
        new: newRisk.severity,
      });
    }
    if (oldRisk.status !== newRisk.status) {
      risksModified.push({
        risk_id: id,
        field: 'status',
        old: oldRisk.status,
        new: newRisk.status,
      });
    }
    if (oldRisk.category !== newRisk.category) {
      risksModified.push({
        risk_id: id,
        field: 'category',
        old: oldRisk.category,
        new: newRisk.category,
      });
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
      if (m.field === 'permissions') {
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
    lines.push('No differences found between the two AgentBOMs.');
  }

  return lines.join('\n');
}

// --- Semver utilities ---

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

export function parseSemver(version: string): SemVer | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?(?:\+([\w.]+))?$/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    ...(match[4] ? { prerelease: match[4] } : {}),
    ...(match[5] ? { build: match[5] } : {}),
  };
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`Invalid semver: ${!pa ? a : b}`);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (pa.prerelease && !pb.prerelease) return -1;
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && pb.prerelease) return pa.prerelease.localeCompare(pb.prerelease);
  return 0;
}

export function isVersionInRange(version: string, range: string): boolean {
  if (range.startsWith('>=')) return compareSemver(version, range.slice(2)) >= 0;
  if (range.startsWith('<=')) return compareSemver(version, range.slice(2)) <= 0;
  if (range.startsWith('>')) return compareSemver(version, range.slice(1)) > 0;
  if (range.startsWith('<')) return compareSemver(version, range.slice(1)) < 0;
  return version === range;
}

// --- Migration framework ---

export type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;

export interface MigrationStep {
  fromVersion: string;
  toVersion: string;
  migrate: MigrationFn;
  description: string;
  breaking: boolean;
}

export interface MigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  data: Record<string, unknown>;
  stepsApplied: MigrationStep[];
  warnings: string[];
  errors: string[];
}

export interface DeprecationNotice {
  version: string;
  message: string;
  severity: 'info' | 'warn' | 'deprecated';
}

export interface VersionedValidationResult extends ValidationResult {
  version_warnings: DeprecationNotice[];
  detected_version: string | null;
}

/** Currently supported AgentBOM schema versions. */
const SUPPORTED_VERSIONS: readonly string[] = ['0.1'];
const LATEST_VERSION = '0.1';
const DEPRECATED_VERSIONS: Map<string, DeprecationNotice> = new Map();
const MIGRATION_REGISTRY: MigrationStep[] = [];

export function getSupportedVersions(): string[] {
  return [...SUPPORTED_VERSIONS];
}

export function getLatestVersion(): string {
  return LATEST_VERSION;
}

/** Register a migration step. Call at module init time to extend the framework. */
export function registerMigration(step: MigrationStep): void {
  MIGRATION_REGISTRY.push(step);
}

/** Find the shortest migration path from `from` to `to` via registered steps (BFS). */
export function getMigrationPath(fromVersion: string, toVersion: string): MigrationStep[] {
  const visited = new Set<string>([fromVersion]);
  const queue: Array<{ version: string; path: MigrationStep[] }> = [
    { version: fromVersion, path: [] },
  ];

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) break;
    const { version, path } = entry;
    if (version === toVersion) return path;

    for (const step of MIGRATION_REGISTRY) {
      if (step.fromVersion === version && !visited.has(step.toVersion)) {
        visited.add(step.toVersion);
        queue.push({ version: step.toVersion, path: [...path, step] });
      }
    }
  }

  return [];
}

/** Mark a version as deprecated with a notice consumers should surface. */
export function deprecateVersion(notice: DeprecationNotice): void {
  DEPRECATED_VERSIONS.set(notice.version, notice);
}

/** Migrate an AgentBOM document to a target schema version. */
export function migrateAgentBOM(
  data: Record<string, unknown>,
  targetVersion?: string,
): MigrationResult {
  const fromVersion = String(data.agentbom_version ?? 'unknown');
  const target = targetVersion ?? LATEST_VERSION;

  if (fromVersion === target) {
    return {
      success: true,
      fromVersion,
      toVersion: target,
      data,
      stepsApplied: [],
      warnings: [],
      errors: [],
    };
  }

  const path = getMigrationPath(fromVersion, target);
  if (path.length === 0) {
    return {
      success: false,
      fromVersion,
      toVersion: target,
      data,
      stepsApplied: [],
      warnings: [],
      errors: [`No migration path from ${fromVersion} to ${target}`],
    };
  }

  let current = { ...data };
  const warnings: string[] = [];
  const applied: MigrationStep[] = [];

  for (const step of path) {
    if (step.breaking) {
      warnings.push(
        `Breaking migration: ${step.description} (${step.fromVersion} → ${step.toVersion})`,
      );
    }
    try {
      current = step.migrate(current);
      applied.push(step);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        fromVersion,
        toVersion: target,
        data: current,
        stepsApplied: applied,
        warnings,
        errors: [`Migration failed at step ${step.fromVersion} → ${step.toVersion}: ${message}`],
      };
    }
  }

  return {
    success: true,
    fromVersion,
    toVersion: target,
    data: current,
    stepsApplied: applied,
    warnings,
    errors: [],
  };
}

/** Detect deprecation notices for a given version string. */
export function detectVersionWarnings(version: string): DeprecationNotice[] {
  const notices: DeprecationNotice[] = [];
  const notice = DEPRECATED_VERSIONS.get(version);
  if (notice) {
    notices.push(notice);
  } else if (!SUPPORTED_VERSIONS.includes(version)) {
    notices.push({
      version,
      message: `AgentBOM version ${version} is not in the supported set (${SUPPORTED_VERSIONS.join(', ')})`,
      severity: 'warn',
    });
  }
  return notices;
}

/** Validate an AgentBOM and return version-aware diagnostics (deprecation notices, etc.). */
export function validateAgentBOMWithVersioning(data: unknown): VersionedValidationResult {
  const raw = data as Record<string, unknown> | null;
  const version = (raw?.agentbom_version as string | undefined) ?? null;
  const versionWarnings = detectVersionWarnings(version ?? 'unknown');

  const baseResult = validateAgentBOM(data);

  return {
    ...baseResult,
    version_warnings: versionWarnings,
    detected_version: version,
  };
}

// --- Continuous Trust Monitoring ---

/** Severity levels for trust monitoring events. */
export type TrustEventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/** Categories of trust events produced by drift monitoring. */
export type TrustEventCategory =
  | 'tool_added'
  | 'tool_removed'
  | 'permission_escalation'
  | 'permission_reduction'
  | 'risk_introduced'
  | 'risk_resolved'
  | 'risk_escalated'
  | 'scope_expanded'
  | 'scope_restricted';

/** A single trust event produced by continuous monitoring of BOM drift. */
export interface TrustEvent {
  /** Machine-readable event category. */
  category: TrustEventCategory;
  /** Severity of the event. */
  severity: TrustEventSeverity;
  /** Human-readable description of the event. */
  description: string;
  /** The affected entity (tool_id, risk_id, or permission scope). */
  subject: string;
  /** ISO 8601 timestamp when the event was detected. */
  detected_at: string;
}

/** A drift alert groups trust events produced by comparing two AgentBOM snapshots. */
export interface DriftAlert {
  /** The agent_id of the monitored agent. */
  agent_id: string;
  /** ISO 8601 timestamp of the baseline (old) snapshot. */
  baseline_at: string;
  /** ISO 8601 timestamp of the current (new) snapshot. */
  current_at: string;
  /** Trust events produced by drift analysis. */
  events: TrustEvent[];
  /** Whether this alert contains any high or critical events. */
  hasHighSeverity(): boolean;
  /** Whether this alert is empty (no events). */
  isEmpty(): boolean;
}

/** Create a DriftAlert with computed helper methods. */
export function createDriftAlert(
  partial: Omit<DriftAlert, 'hasHighSeverity' | 'isEmpty'>,
): DriftAlert {
  const hasHighSeverity = (): boolean =>
    partial.events.some((e) => e.severity === 'high' || e.severity === 'critical');
  const isEmpty = (): boolean => partial.events.length === 0;
  return { ...partial, hasHighSeverity, isEmpty };
}

/** Severity for a tool based on its permissions and risk signals. */
function toolEventSeverity(tool: ToolEntry): TrustEventSeverity {
  const riskyPerms = ['network:*', 'fs:write', 'process:exec', 'credential:*'];
  const hasRiskyPerm = (tool.permissions ?? []).some((p) =>
    riskyPerms.some((rp) => p === rp || (rp.endsWith(':*') && p.startsWith(rp.slice(0, -1)))),
  );
  const hasCriticalSignal = (tool.risk_signals ?? []).some((s) =>
    ['command_execution', 'credential_access', 'exfiltration'].includes(s),
  );
  if (hasCriticalSignal) return 'critical';
  if (hasRiskyPerm) return 'high';
  return 'medium';
}

/** Severity for a risk entry based on its severity field. */
function riskEventSeverity(severity: string): TrustEventSeverity {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    default:
      return 'low';
  }
}

/**
 * Classify trust events from an AgentBOM diff for continuous monitoring.
 *
 * Analyzes the diff between two BOM snapshots and produces a `DriftAlert`
 * containing `TrustEvent` entries for:
 * - Tool additions and removals
 * - Permission escalation (new permissions added to existing tools)
 * - Permission reductions (permissions removed from existing tools)
 * - New risk entries introduced
 * - Risk escalations (severity increased)
 * - Risk resolutions (risk entries removed)
 * - Scope expansions (new permission scopes granted)
 * - Scope restrictions (permission scopes removed)
 */
export function classifyDriftEvents(
  diff: AgentBOMDiff,
  agentId: string,
  baselineAt: string,
  currentAt: string,
): DriftAlert {
  const now = new Date().toISOString();
  const events: TrustEvent[] = [];

  // Tool additions
  for (const tool of diff.tools.added) {
    events.push({
      category: 'tool_added',
      severity: toolEventSeverity(tool),
      description: `Tool "${tool.tool_name}" (${tool.tool_id}) added from ${tool.source}`,
      subject: tool.tool_id,
      detected_at: now,
    });
  }

  // Tool removals
  for (const tool of diff.tools.removed) {
    events.push({
      category: 'tool_removed',
      severity: 'info',
      description: `Tool "${tool.tool_name}" (${tool.tool_id}) removed`,
      subject: tool.tool_id,
      detected_at: now,
    });
  }

  // Permission changes on tools
  for (const mod of diff.tools.modified) {
    if (mod.field === 'permissions') {
      if (mod.new) {
        events.push({
          category: 'permission_escalation',
          severity: 'high',
          description: `Permission "${mod.new}" added to tool ${mod.tool_id}`,
          subject: mod.tool_id,
          detected_at: now,
        });
      } else if (mod.old) {
        events.push({
          category: 'permission_reduction',
          severity: 'info',
          description: `Permission "${mod.old}" removed from tool ${mod.tool_id}`,
          subject: mod.tool_id,
          detected_at: now,
        });
      }
    }
  }

  // Risk changes
  for (const risk of diff.risks.added) {
    events.push({
      category: 'risk_introduced',
      severity: riskEventSeverity(risk.severity),
      description: `New risk "${risk.description}" (${risk.severity}/${risk.category})`,
      subject: risk.risk_id,
      detected_at: now,
    });
  }

  for (const risk of diff.risks.removed) {
    events.push({
      category: 'risk_resolved',
      severity: 'info',
      description: `Risk "${risk.risk_id}" (${risk.description}) removed`,
      subject: risk.risk_id,
      detected_at: now,
    });
  }

  for (const mod of diff.risks.modified) {
    if (mod.field === 'severity') {
      const severityOrder: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
      if ((severityOrder[mod.new] ?? 0) > (severityOrder[mod.old] ?? 0)) {
        events.push({
          category: 'risk_escalated',
          severity: riskEventSeverity(mod.new),
          description: `Risk ${mod.risk_id} severity escalated from ${mod.old} to ${mod.new}`,
          subject: mod.risk_id,
          detected_at: now,
        });
      }
    }
  }

  // Permission scope changes
  for (const scope of diff.permissions.added) {
    events.push({
      category: 'scope_expanded',
      severity: 'high',
      description: `Permission scope "${scope}" granted`,
      subject: scope,
      detected_at: now,
    });
  }

  for (const scope of diff.permissions.removed) {
    events.push({
      category: 'scope_restricted',
      severity: 'info',
      description: `Permission scope "${scope}" removed`,
      subject: scope,
      detected_at: now,
    });
  }

  return createDriftAlert({
    agent_id: agentId,
    baseline_at: baselineAt,
    current_at: currentAt,
    events,
  });
}

/** Format a drift alert as a human-readable string for monitoring output. */
export function formatDriftAlert(alert: DriftAlert): string {
  const lines: string[] = [
    `Drift Alert — agent: ${alert.agent_id}`,
    `  Baseline: ${alert.baseline_at} → Current: ${alert.current_at}`,
    `  Events: ${alert.events.length}`,
  ];

  // Group events by severity
  const bySeverity = new Map<TrustEventSeverity, TrustEvent[]>();
  for (const event of alert.events) {
    const group = bySeverity.get(event.severity) ?? [];
    group.push(event);
    bySeverity.set(event.severity, group);
  }

  for (const [severity, events] of bySeverity) {
    lines.push('');
    lines.push(`  [${severity.toUpperCase()}] (${events.length})`);
    for (const event of events) {
      lines.push(`    • ${event.category}: ${event.description}`);
    }
  }

  if (alert.isEmpty()) {
    lines.push('  No drift events.');
  }

  return lines.join('\n');
}
