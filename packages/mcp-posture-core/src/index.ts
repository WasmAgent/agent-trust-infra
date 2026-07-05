import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";

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

// Schema lives at the repository root: <root>/specs/mcp-posture/schema.json
// This file is <root>/packages/mcp-posture-core/src/index.ts.
const SCHEMA_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../specs/mcp-posture/schema.json",
);

let validateSchema: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (validateSchema) return validateSchema;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  validateSchema = ajv.compile(schema);
  return validateSchema;
}

/** Convert an AJV instancePath (JSON pointer) into a dot-notation field path. */
function toFieldPath(instancePath: string, extra?: string): string {
  let path = instancePath.startsWith("/") ? instancePath.slice(1) : instancePath;
  path = path.replace(/\//g, ".");
  if (extra) path = path ? `${path}.${extra}` : extra;
  return path || "(root)";
}

/** For errors that name a specific property, return it so it can be folded into the field path. */
function namedProperty(err: ErrorObject): string | undefined {
  if (err.keyword === "required") {
    return (err.params as { missingProperty?: string } | undefined)?.missingProperty;
  }
  if (err.keyword === "additionalProperties") {
    return (err.params as { additionalProperty?: string } | undefined)?.additionalProperty;
  }
  return undefined;
}

export function validateMCPPosture(data: unknown): ValidationResult {
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
        { field: "(root)", message: `schema validation crashed: ${message}`, keyword: "exception" },
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

export function inspectMCPPosture(data: Record<string, unknown>): string {
  const identity = data.identity as Record<string, string> | undefined;
  const servers = (data.servers as Record<string, unknown>[]) ?? [];
  const risks = (data.risk_summary as Record<string, string>[]) ?? [];
  const permissionGraph = data.permission_graph as Record<string, unknown> | undefined;

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
    `MCP Posture v${data.posture_version}`,
    `  Snapshot:        ${identity?.snapshot_id ?? "?"}`,
    `  Agent:           ${identity?.agent_id ?? "?"}`,
    `  Servers:         ${servers.length}`,
    `  Tools:           ${totalTools}`,
    `  High-risk tools: ${highRiskTools}`,
    `  Risks:           ${risks.length}`,
  ];

  const criticalOrHigh = risks.filter(
    (r) => r.severity === "critical" || r.severity === "high",
  );

  if (criticalOrHigh.length > 0) {
    lines.push("");
    lines.push(`  ⚠  ${criticalOrHigh.length} critical/high finding(s):`);
    for (const r of criticalOrHigh) {
      lines.push(`    [${r.severity.toUpperCase()}] ${r.finding_id}: ${r.description}`);
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
