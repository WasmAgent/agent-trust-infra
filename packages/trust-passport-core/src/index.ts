import { createHash } from "node:crypto";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const PASSPORT_REQUIRED = ["passport_version", "identity", "validity", "revocation", "attestation"] as const;

const VALID_COVERAGE_VALUES = ["selected_technical_evidence", "partial", "none"] as const;

const hasOwn = Object.prototype.hasOwnProperty.call.bind(Object.prototype.hasOwnProperty);

/** Check that a value is a plain object (not null, not array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Collect errors if a required field is missing or not an object. */
function expectObject(
  d: Record<string, unknown>,
  key: string,
  errors: string[],
): Record<string, unknown> | undefined {
  if (!(key in d)) {
    // already handled by required-field check
    return undefined;
  }
  if (!isRecord(d[key])) {
    errors.push(`${key} must be an object`);
    return undefined;
  }
  const obj = d[key] as Record<string, unknown>;
  if (hasOwn(obj, "__proto__") || hasOwn(obj, "constructor") || hasOwn(obj, "prototype")) {
    errors.push(`${key} contains unsafe reserved keys (__proto__, constructor, or prototype)`);
    return undefined;
  }
  return obj;
}

/** Collect errors if a required string field is missing or not a string. */
function expectString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): string | undefined {
  if (!(key in obj)) {
    errors.push(`${path}: missing ${key}`);
    return undefined;
  }
  if (typeof obj[key] !== "string") {
    errors.push(`${path}.${key} must be a string`);
    return undefined;
  }
  return obj[key] as string;
}

/**
 * Collect errors if a required string field is missing, not a string,
 * or does not match the optional date-time regex.
 * The regex /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/ enforces
 * ISO 8601 UTC ending in Z (no fractional seconds required, but allowed).
 */
function expectDateTimeString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): void {
  const raw = obj[key];
  if (raw === undefined) {
    errors.push(`${path}: missing ${key}`);
    return;
  }
  if (typeof raw !== "string") {
    errors.push(`${path}.${key} must be a string`);
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(raw)) {
    errors.push(`${path}.${key} must be an ISO 8601 UTC date string (ending in Z)`);
  }
}

export function validateTrustPassport(data: unknown): ValidationResult {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, errors: ["root must be an object"] };
  }
  const d = data as Record<string, unknown>;
  const errors: string[] = [];

  // Guard against prototype pollution keys (own properties only)
  if (hasOwn(d, "__proto__") || hasOwn(d, "constructor") || hasOwn(d, "prototype")) {
    return { valid: false, errors: ["root contains unsafe reserved keys (__proto__, constructor, or prototype)"] };
  }

  // --- Required top-level fields ---
  errors.push(...PASSPORT_REQUIRED.filter((k) => !(k in d)).map((k) => `missing required: ${k}`));

  // --- passport_version ---
  if ("passport_version" in d) {
    if (typeof d.passport_version !== "string") {
      errors.push('passport_version must be a string');
    } else if (d.passport_version !== "0.1") {
      errors.push(`passport_version must be "0.1"`);
    }
  }

  // --- identity ---
  const identity = expectObject(d, "identity", errors);
  if (identity) {
    expectString(identity, "passport_id", "identity", errors);
    expectString(identity, "agent_id", "identity", errors);
    expectString(identity, "agent_name", "identity", errors);
    expectString(identity, "issuer", "identity", errors);
    expectString(identity, "issuance_context", "identity", errors);
  }

  // --- validity ---
  const validity = expectObject(d, "validity", errors);
  if (validity) {
    expectDateTimeString(validity, "issued_at", "validity", errors);
    expectDateTimeString(validity, "expires_at", "validity", errors);
  }

  // --- revocation ---
  const revocation = expectObject(d, "revocation", errors);
  if (revocation) {
    if (!("revoked" in revocation)) {
      errors.push("revocation: missing revoked");
    } else if (typeof revocation.revoked !== "boolean") {
      errors.push("revocation.revoked must be a boolean");
    }
    if (!("revocation_triggers" in revocation)) {
      errors.push("revocation: missing revocation_triggers");
    } else if (!Array.isArray(revocation.revocation_triggers)) {
      errors.push("revocation.revocation_triggers must be an array");
    }
  }

  // --- attestation ---
  const attestation = expectObject(d, "attestation", errors);
  if (attestation) {
    expectString(attestation, "issuer", "attestation", errors);
  }

  // --- evidence_summary.framework_mappings coverage enum ---
  if (d.evidence_summary && typeof d.evidence_summary === "object") {
    const es = d.evidence_summary as Record<string, unknown>;
    if (Array.isArray(es.framework_mappings)) {
      for (const mapping of es.framework_mappings) {
        if (typeof mapping === "object" && mapping !== null && !Array.isArray(mapping)) {
          const m = mapping as Record<string, unknown>;
          if ("coverage" in m && typeof m.coverage === "string") {
            if (!VALID_COVERAGE_VALUES.includes(m.coverage as (typeof VALID_COVERAGE_VALUES)[number])) {
              errors.push(
                `evidence_summary.framework_mappings.coverage: invalid value "${m.coverage}", must be one of: ${VALID_COVERAGE_VALUES.join(", ")}`,
              );
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
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

// ────────────────────────────────────────────────
// Content-addressable evidence storage API
// ────────────────────────────────────────────────

/**
 * Hash evidence content to a content-addressable reference.
 *
 * Produces a deterministic `sha256:hex` string that uniquely identifies the
 * given content. The same content always yields the same hash, enabling
 * content-addressable storage and verification of evidence facts.
 *
 * @param content - The evidence content to hash (typically a JSON string or
 *                  plain text).
 * @returns A content-addressable reference of the form `sha256:<hex>`.
 *
 * @example
 * ```ts
 * hashEvidence("agent tool call: get_weather");
 * // => "sha256:abc123..."
 * ```
 */
export function hashEvidence(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf-8").digest("hex")}`;
}

/**
 * Evidence fact entry stored in a trust passport under `evidence_facts`.
 */
export interface EvidenceFact {
  /** Content-addressable hash of the evidence (sha256:hex). */
  content_hash: string;
  /** ISO-8601 timestamp when the fact was recorded. */
  recorded_at: string;
}

/**
 * Add a content-addressed evidence fact to a trust passport.
 *
 * Hashes the provided content using {@link hashEvidence} and stores the
 * resulting content hash together with a recording timestamp under
 * `passport.evidence_facts[factId]`. The passport is mutated in place and
 * also returned for chaining.
 *
 * If the passport already has an `evidence_facts` map, the new fact is merged
 * into it; otherwise a new map is created.
 *
 * @param passport - A trust passport object (mutated in place).
 * @param factId   - Unique identifier for the evidence fact (e.g.
 *                   `"tool-call-get-weather"`).
 * @param content  - The evidence content to hash and reference. Strings are
 *                   hashed directly; all other values are JSON-stringified
 *                   before hashing.
 * @returns The same passport object, updated with the new evidence fact.
 *
 * @example
 * ```ts
 * const passport = { passport_version: "0.1", ... };
 * addFact(passport, "tool-call-001", "get_weather(location='NYC')");
 * passport.evidence_facts["tool-call-001"].content_hash
 * // => "sha256:abc123..."
 * ```
 */
export function addFact(
  passport: Record<string, unknown>,
  factId: string,
  content: unknown,
): Record<string, unknown> {
  // Normalise content to a string for hashing
  const contentStr = typeof content === "string" ? content : JSON.stringify(content);
  const contentHash = hashEvidence(contentStr);
  const recordedAt = new Date().toISOString();

  // Ensure evidence_facts map exists
  if (!passport.evidence_facts || !isRecord(passport.evidence_facts)) {
    passport.evidence_facts = {};
  }

  (passport.evidence_facts as Record<string, unknown>)[factId] = {
    content_hash: contentHash,
    recorded_at: recordedAt,
  };

  return passport;
}
