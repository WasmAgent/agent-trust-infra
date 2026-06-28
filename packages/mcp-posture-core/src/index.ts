import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../../specs/mcp-posture/schema.json" assert { type: "json" };

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateMCPPosture(data: unknown): ValidationResult {
  const valid = validate(data) as boolean;
  const errors = valid
    ? []
    : (validate.errors ?? []).map(
        (e) => `${e.instancePath || "root"} ${e.message}`
      );
  return { valid, errors };
}

export function inspectMCPPosture(data: Record<string, unknown>): string {
  const identity = data.identity as Record<string, string> | undefined;
  const servers = (data.servers as unknown[]) ?? [];
  const risks = (data.risk_summary as unknown[]) ?? [];
  const lines = [
    `MCP Posture v${data.posture_version}`,
    `  Snapshot: ${identity?.snapshot_id ?? "?"}`,
    `  Agent:    ${identity?.agent_id ?? "?"}`,
    `  Servers:  ${servers.length}`,
    `  Risks:    ${risks.length}`,
  ];
  return lines.join("\n");
}
