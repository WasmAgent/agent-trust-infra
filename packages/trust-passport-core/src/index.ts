export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const PASSPORT_REQUIRED = ["passport_version", "identity", "validity", "attestation"] as const;

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
