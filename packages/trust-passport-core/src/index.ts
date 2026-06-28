import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../../specs/trust-passport/schema.json" assert { type: "json" };

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTrustPassport(data: unknown): ValidationResult {
  const valid = validate(data) as boolean;
  const errors = valid
    ? []
    : (validate.errors ?? []).map(
        (e) => `${e.instancePath || "root"} ${e.message}`
      );
  return { valid, errors };
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
  const lines = [
    `Trust Passport v${data.passport_version}`,
    `  Passport: ${identity?.passport_id ?? "?"}`,
    `  Agent:    ${identity?.agent_name ?? identity?.agent_id ?? "?"}`,
    `  Issued:   ${validity?.issued_at ?? "?"}`,
    `  Expires:  ${validity?.expires_at ?? "?"}`,
    `  Revoked:  ${revocation?.revoked ?? false}`,
    `  Open risks: critical=${risks?.critical ?? 0} high=${risks?.high ?? 0}`,
  ];
  return lines.join("\n");
}
