export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const AGENTBOM_REQUIRED = ["agentbom_version", "identity", "attestation"] as const;
const IDENTITY_REQUIRED = ["agent_id", "agent_name", "generated_at"] as const;
const VALID_VERSIONS = ["0.1"];

export function validateAgentBOM(data: unknown): ValidationResult {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, errors: ["root must be an object"] };
  }
  const d = data as Record<string, unknown>;
  const errors: string[] = [];

  errors.push(...AGENTBOM_REQUIRED.filter((k) => !(k in d)).map((k) => `missing required: ${k}`));

  if ("agentbom_version" in d && !VALID_VERSIONS.includes(d.agentbom_version as string)) {
    errors.push(`agentbom_version must be one of: ${VALID_VERSIONS.join(", ")}`);
  }

  if (d.identity && typeof d.identity === "object") {
    const id = d.identity as Record<string, unknown>;
    errors.push(...IDENTITY_REQUIRED.filter((k) => !(k in id)).map((k) => `identity: missing ${k}`));
  }

  return { valid: errors.length === 0, errors };
}

export function inspectAgentBOM(data: Record<string, unknown>): string {
  const identity = data.identity as Record<string, string> | undefined;
  const toolLayer = (data.tool_layer as unknown[]) ?? [];
  const riskLayer = (data.risk_layer as unknown[]) ?? [];
  return [
    `AgentBOM v${data.agentbom_version}`,
    `  Agent:   ${identity?.agent_name ?? "unknown"} (${identity?.agent_id ?? "?"})`,
    `  Context: ${identity?.deployment_context ?? "unset"}`,
    `  Tools:   ${toolLayer.length}`,
    `  Risks:   ${riskLayer.length}`,
  ].join("\n");
}
