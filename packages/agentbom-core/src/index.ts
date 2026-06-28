import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../../specs/agentbom/schema.json" assert { type: "json" };

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAgentBOM(data: unknown): ValidationResult {
  const valid = validate(data) as boolean;
  const errors = valid
    ? []
    : (validate.errors ?? []).map(
        (e) => `${e.instancePath || "root"} ${e.message}`
      );
  return { valid, errors };
}

export function inspectAgentBOM(data: Record<string, unknown>): string {
  const identity = data.identity as Record<string, string> | undefined;
  const toolLayer = (data.tool_layer as unknown[]) ?? [];
  const riskLayer = (data.risk_layer as unknown[]) ?? [];
  const lines = [
    `AgentBOM v${data.agentbom_version}`,
    `  Agent:   ${identity?.agent_name ?? "unknown"} (${identity?.agent_id ?? "?"})`,
    `  Context: ${identity?.deployment_context ?? "unset"}`,
    `  Tools:   ${toolLayer.length}`,
    `  Risks:   ${riskLayer.length}`,
  ];
  return lines.join("\n");
}
