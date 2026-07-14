import { createHash } from "node:crypto";

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

const PASSPORT_REQUIRED = [
	"passport_version",
	"identity",
	"validity",
	"revocation",
	"attestation",
] as const;

const VALID_COVERAGE_VALUES = [
	"selected_technical_evidence",
	"partial",
	"none",
] as const;

const hasOwn = Object.prototype.hasOwnProperty.call.bind(
	Object.prototype.hasOwnProperty,
);

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
	if (
		hasOwn(obj, "__proto__") ||
		hasOwn(obj, "constructor") ||
		hasOwn(obj, "prototype")
	) {
		errors.push(
			`${key} contains unsafe reserved keys (__proto__, constructor, or prototype)`,
		);
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
		errors.push(
			`${path}.${key} must be an ISO 8601 UTC date string (ending in Z)`,
		);
	}
}

export function validateTrustPassport(data: unknown): ValidationResult {
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		return { valid: false, errors: ["root must be an object"] };
	}
	const d = data as Record<string, unknown>;
	const errors: string[] = [];

	// Guard against prototype pollution keys (own properties only)
	if (
		hasOwn(d, "__proto__") ||
		hasOwn(d, "constructor") ||
		hasOwn(d, "prototype")
	) {
		return {
			valid: false,
			errors: [
				"root contains unsafe reserved keys (__proto__, constructor, or prototype)",
			],
		};
	}

	// --- Required top-level fields ---
	errors.push(
		...PASSPORT_REQUIRED.filter((k) => !(k in d)).map(
			(k) => `missing required: ${k}`,
		),
	);

	// --- passport_version ---
	if ("passport_version" in d) {
		if (typeof d.passport_version !== "string") {
			errors.push("passport_version must be a string");
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
				if (
					typeof mapping === "object" &&
					mapping !== null &&
					!Array.isArray(mapping)
				) {
					const m = mapping as Record<string, unknown>;
					if ("coverage" in m && typeof m.coverage === "string") {
						if (
							!VALID_COVERAGE_VALUES.includes(
								m.coverage as (typeof VALID_COVERAGE_VALUES)[number],
							)
						) {
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

export function isExpired(passport: {
	validity?: { expires_at?: string };
}): boolean {
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

const RESERVED_KEYS = ["__proto__", "constructor", "prototype"];

/**
 * Build a safe, defensive copy of an existing `evidence_facts` map.
 *
 * Returns a brand-new object carrying over only the own enumerable keys of
 * the input that are not reserved prototype-pollution vectors. Non-record
 * inputs (primitives, `null`, or arrays) yield an empty map. Because the
 * result is always a fresh object, the caller's input can never be aliased
 * or mutated by subsequent writes to the returned map.
 */
function sanitizeEvidenceFacts(existing: unknown): Record<string, unknown> {
	const next: Record<string, unknown> = {};
	if (isRecord(existing)) {
		for (const key of Object.keys(existing)) {
			if (RESERVED_KEYS.includes(key)) continue;
			next[key] = (existing as Record<string, unknown>)[key];
		}
	}
	return next;
}

/**
 * Add a content-addressed evidence fact to a trust passport.
 *
 * Hashes the provided content using {@link hashEvidence} and stores the
 * resulting content hash together with a recording timestamp under
 * `evidence_facts[factId]` of a NEW passport object.
 *
 * This function is pure with respect to its input: it never mutates the
 * supplied `passport` and never aliases its existing `evidence_facts` map.
 * It returns a new passport object whose `evidence_facts` map merges any
 * pre-existing safe facts with the newly recorded one. This makes it safe to
 * use with shared/immutable data structures and avoids reference-aliasing
 * side effects.
 *
 * @param passport - A trust passport object (NOT mutated).
 * @param factId   - Unique identifier for the evidence fact (e.g.
 *                   `"tool-call-get-weather"`). Must not be a reserved key
 *                   (`__proto__`, `constructor`, or `prototype`).
 * @param content  - The evidence content to hash and reference. Strings are
 *                   hashed directly; all other values are JSON-stringified
 *                   before hashing.
 * @returns A new passport object with the evidence fact recorded. The input
 *           passport is left unchanged.
 *
 * @throws {Error} If `factId` is a reserved JavaScript key that could enable
 *                  prototype pollution.
 *
 * @example
 * ```ts
 * const passport = { passport_version: "0.1", ... };
 * const updated = addFact(passport, "tool-call-001", "get_weather(location='NYC')");
 * updated.evidence_facts["tool-call-001"].content_hash;
 * // => "sha256:abc123..."
 * ```
 */
export function addFact(
	passport: Record<string, unknown>,
	factId: string,
	content: unknown,
): Record<string, unknown> {
	// Guard against prototype pollution keys
	if (RESERVED_KEYS.includes(factId)) {
		throw new Error(
			`factId "${factId}" is a reserved key and cannot be used as an evidence fact identifier`,
		);
	}

	// Normalise content to a string for hashing
	const contentStr =
		typeof content === "string" ? content : JSON.stringify(content);
	const contentHash = hashEvidence(contentStr);
	const recordedAt = new Date().toISOString();

	// Build a fresh evidence_facts map from any safe pre-existing facts WITHOUT
	// mutating the input passport or aliasing its existing map. Reserved keys
	// and non-record shapes are discarded defensively.
	const nextFacts = sanitizeEvidenceFacts(passport.evidence_facts);
	nextFacts[factId] = {
		content_hash: contentHash,
		recorded_at: recordedAt,
	};

	// Return a new passport object; the input is left untouched.
	return { ...passport, evidence_facts: nextFacts };
}
