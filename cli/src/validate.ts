import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateAgentBOM,
  type ValidationResult as AgentBOMValidationResult,
} from "../../packages/agentbom-core/src/index.js";
import {
  validateTrustPassport,
  type ValidationResult as PassportValidationResult,
} from "../../packages/trust-passport-core/src/index.js";
import {
  validateMCPPosture,
  type ValidationResult as PostureValidationResult,
} from "../../packages/mcp-posture-core/src/index.js";

type ValidationResult = AgentBOMValidationResult | PassportValidationResult | PostureValidationResult;

interface ArtifactType {
  name: string;
  detect: (data: Record<string, unknown>) => boolean;
  validate: (data: unknown) => ValidationResult;
}

const ARTIFACT_TYPES: ArtifactType[] = [
  {
    name: "AgentBOM",
    detect: (data) => typeof data.agentbom_version === "string" && "identity" in data && "tool_layer" in data,
    validate: (data) => validateAgentBOM(data),
  },
  {
    name: "Trust Passport",
    detect: (data) => typeof data.passport_version === "string" && "identity" in data && "validity" in data,
    validate: (data) => validateTrustPassport(data),
  },
  {
    name: "MCP Posture",
    detect: (data) => typeof data.posture_version === "string" && "identity" in data && "servers" in data,
    validate: (data) => validateMCPPosture(data),
  },
];

function detectArtifactType(data: Record<string, unknown>): ArtifactType | null {
  for (const type of ARTIFACT_TYPES) {
    if (type.detect(data)) {
      return type;
    }
  }
  return null;
}

export function validateCommand(filePath: string): number {
  const resolvedPath = resolve(filePath);

  let raw: string;
  try {
    raw = readFileSync(resolvedPath, "utf-8");
  } catch {
    console.error(`Error: cannot read file "${resolvedPath}"`);
    return 1;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Error: "${resolvedPath}" is not valid JSON`);
    if (err instanceof Error && err.message) {
      console.error(`  ${err.message}`);
    }
    return 1;
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    console.error(`Error: artifact must be a JSON object, got ${Array.isArray(data) ? "array" : typeof data}`);
    return 1;
  }

  const artifact = data as Record<string, unknown>;
  const artifactType = detectArtifactType(artifact);

  if (!artifactType) {
    console.error(`Error: could not detect artifact type. Supported types:`);
    for (const type of ARTIFACT_TYPES) {
      console.error(`  - ${type.name}`);
    }
    return 1;
  }

  console.log(`Detected artifact type: ${artifactType.name}`);
  console.log();

  const result = artifactType.validate(data);

  if (!result.valid) {
    console.error(`Validation failed for "${resolvedPath}":`);
    console.error();
    for (const err of result.errors) {
      console.error(`  ✗ ${err}`);
    }
    console.error();
    console.error(`Found ${result.errors.length} error(s).`);
    return 1;
  }

  console.log(`✓ Artifact is valid.`);
  console.log();
  console.log(`  File: ${resolvedPath}`);
  console.log(`  Type: ${artifactType.name}`);
  console.log();

  return 0;
}
