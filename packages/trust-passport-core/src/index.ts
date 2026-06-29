export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const PASSPORT_REQUIRED = ["passport_version", "identity", "validity", "revocation", "attestation"] as const;

const VALID_COVERAGE_VALUES = ["selected_technical_evidence", "partial", "none"] as const;

export function validateTrustPassport(data: unknown): ValidationResult {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, errors: ["root must be an object"] };
  }
  const d = data as Record<string, unknown>;
  const errors: string[] = [];

  errors.push(...PASSPORT_REQUIRED.filter((k) => !(k in d)).map((k) => `missing required: ${k}`));

  if ("passport_version" in d && d.passport_version !== "0.1") {
    errors.push(`passport_version must be "0.1"`);
  }

  if (d.validity && typeof d.validity === "object") {
    const v = d.validity as Record<string, unknown>;
    ["issued_at", "expires_at"].forEach((k) => {
      if (!(k in v)) errors.push(`validity: missing ${k}`);
    });
  }

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
