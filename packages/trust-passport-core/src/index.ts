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

// Schema lives at the repository root: <root>/specs/trust-passport/schema.json
// This file is <root>/packages/trust-passport-core/src/index.ts.
const SCHEMA_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../specs/trust-passport/schema.json",
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

export function validateTrustPassport(data: unknown): ValidationResult {
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

export function isExpired(passport: { validity?: { expires_at?: string } }): boolean {
  const expiresAt = passport.validity?.expires_at;
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function inspectTrustPassport(data: Record<string, unknown>): string {
  const identity = data.identity as Record<string, string> | undefined;
  const validity = data.validity as Record<string, string> | undefined;
  const risks = data.risk_summary as Record<string, number> | undefined;
  const revocation = data.revocation as Record<string, unknown> | undefined;
  return [
    `Trust Passport v${data.passport_version}`,
    `  Passport: ${identity?.passport_id ?? "?"}`,
    `  Agent:    ${identity?.agent_name ?? identity?.agent_id ?? "?"}`,
    `  Issued:   ${validity?.issued_at ?? "?"}`,
    `  Expires:  ${validity?.expires_at ?? "?"}`,
    `  Revoked:  ${revocation?.revoked ?? false}`,
    `  Risks:    critical=${risks?.critical ?? 0} high=${risks?.high ?? 0}`,
  ].join("\n");
}
