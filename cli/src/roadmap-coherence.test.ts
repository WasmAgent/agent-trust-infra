/**
 * Schema conformance tests — replaces the old doc-string coherence tests.
 *
 * Validates sample BOM fixtures against the official CycloneDX ML-BOM and
 * SPDX 3.0 AI profile schemas (committed as test/fixtures/schemas/).
 * Also provides an integration smoke test that verifies `trust-cli generate bom`
 * output can be represented in both standard formats.
 *
 * Schemas are loaded from committed fixtures (not fetched at test time).
 * Each test clearly reports which fields are present, absent, or incompatible.
 */
import { describe, expect, it, beforeAll, beforeEach, afterEach } from "bun:test";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import type { ValidateFunction, ErrorObject } from "ajv";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root of the monorepo (two levels up from cli/src/). */
const REPO_ROOT = resolve(__dirname, "../..");
/** Path to the committed schema fixtures. */
const SCHEMAS_DIR = resolve(REPO_ROOT, "test/fixtures/schemas");
/** Path to the AgentBOM demo fixture. */
const DEMO_AGENTBOM = resolve(REPO_ROOT, "examples/agentbom-demo/agentbom.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generate a deterministic UUID v4 from an arbitrary string via DJB2 hashing.
 * Collisions are irrelevant for test fixtures.
 */
function toUUID(input: string): string {
  if (UUID_RE.test(input)) return input.toLowerCase();
  // DJB2 hash the input string
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) & 0xffffffff;
  }
  // Use two hash seeds to produce 32 hex chars (16 bytes)
  const bytes: number[] = [];
  let seed = h;
  for (let i = 0; i < 16; i++) {
    seed = ((seed * 1103515245 + 12345) & 0xffffffff);
    bytes.push(seed & 0xff);
  }
  const hex = bytes.map(b => b.toString(16).padStart(2, "0")).join("");
  // Format as UUID v4: xxxxxxxx-xxxx-4xxx-Nxxx-xxxxxxxxxxxx
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${((parseInt(hex.slice(16,18),16) & 0x3f) | 0x80).toString(16).padStart(2,"0")}${hex.slice(18,20)}-${hex.slice(20,32)}`;
}

/**
 * Load a JSON file and return the parsed content.
 */
function loadJSON(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Build an AJV validator for the given schema JSON.
 */
function compileSchema(schemaPath: string): ValidateFunction {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = loadJSON(schemaPath) as Record<string, unknown>;
  return ajv.compile(schema);
}

/**
 * Validate data against a compiled validator and return structured results.
 */
function validateAgainst(
  validate: ValidateFunction,
  data: unknown,
): { valid: boolean; errors: string[]; fieldDetails: Array<{ field: string; message: string; keyword: string }> } {
  let valid = false;
  try {
    valid = validate(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [`(root): validator crashed: ${msg}`],
      fieldDetails: [{ field: "(root)", message: `validator crashed: ${msg}`, keyword: "exception" }],
    };
  }

  const fieldDetails = (validate.errors ?? []).map((e: ErrorObject) => {
    const path = (e.instancePath ?? "").replace(/^\//, "").replace(/\//g, ".");
    const prop =
      e.keyword === "required"
        ? (e.params as { missingProperty?: string })?.missingProperty
        : e.keyword === "additionalProperties"
          ? (e.params as { additionalProperty?: string })?.additionalProperty
          : undefined;
    const field = path ? (prop ? `${path}.${prop}` : path) : prop ?? "(root)";
    return { field, message: e.message ?? `failed "${e.keyword}"`, keyword: e.keyword };
  });
  const errors = fieldDetails.map((e) => `${e.field}: ${e.message}`);

  return { valid, errors, fieldDetails };
}

/**
 * Map an AgentBOM document (the project's format) to a CycloneDX ML-BOM
 * representation so it can be validated against the CycloneDX schema.
 * Returns a plain object that conforms to the CycloneDX structure.
 */
function mapAgentBOMtoCycloneDX(agentbom: Record<string, unknown>): Record<string, unknown> {
  const identity = (agentbom.identity ?? {}) as Record<string, unknown>;
  const toolLayer = (agentbom.tool_layer ?? []) as Array<Record<string, unknown>>;
  const riskLayer = (agentbom.risk_layer ?? []) as Array<Record<string, unknown>>;
  const permissionLayer = (agentbom.permission_layer ?? {}) as Record<string, unknown>;
  const modelLayer = (agentbom.model_layer ?? {}) as Record<string, unknown>;
  const promptLayer = (agentbom.prompt_layer ?? {}) as Record<string, unknown>;
  const attestation = (agentbom.attestation ?? {}) as Record<string, unknown>;

  const cd: Record<string, unknown> = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    serialNumber: `urn:uuid:${toUUID((identity.agent_id as string) ?? "00000000-0000-0000-0000-000000000000")}`,
    metadata: {
      timestamp: (identity.generated_at as string) ?? new Date().toISOString(),
      tools: [
        {
          vendor: "WasmAgent",
          name: (attestation.generator as string) ?? "unknown",
          version: (attestation.generator_version as string) ?? "",
        },
      ],
      component: {
        type: "ai-agent",
        name: (identity.agent_name as string) ?? "unknown",
        version: (identity.agent_version as string) ?? "",
        "bom-ref": (identity.agent_id as string) ?? "",
        properties: [
          { name: "agent_id", value: (identity.agent_id as string) ?? "" },
          { name: "deployment_context", value: (identity.deployment_context as string) ?? "" },
          { name: "generated_at", value: (identity.generated_at as string) ?? "" },
        ],
      },
    },
    components: [] as Array<Record<string, unknown>>,
    properties: [] as Array<Record<string, unknown>>,
  };

  // Map tools to components
  for (const tool of toolLayer) {
    const comp: Record<string, unknown> = {
      type: (tool.source as string) === "mcp" ? "application" : "library",
      name: tool.tool_name ?? "unknown",
      "bom-ref": tool.tool_id ?? "",
      properties: [
        { name: "tool_id", value: (tool.tool_id as string) ?? "" },
        { name: "source", value: (tool.source as string) ?? "" },
        { name: "permissions", value: ((tool.permissions as string[]) ?? []).join(", ") },
        { name: "risk_signals", value: ((tool.risk_signals as string[]) ?? []).join(", ") },
      ],
    };
    if (tool.mcp_server_id) {
      (comp.properties as Array<Record<string, unknown>>).push({
        name: "mcp_server_id",
        value: tool.mcp_server_id as string,
      });
    }
    (cd.components as Array<Record<string, unknown>>).push(comp);
  }

  // Map model layer as a component
  if (modelLayer && (modelLayer as Record<string, unknown>).provider) {
    const ml = modelLayer as Record<string, unknown>;
    (cd.components as Array<Record<string, unknown>>).push({
      type: "machine-learning-model",
      name: (ml.model_id as string) ?? "unknown",
      version: (ml.model_version as string) ?? "",
      "bom-ref": `model-${ml.model_id}`,
      properties: [
        { name: "provider", value: (ml.provider as string) ?? "" },
        { name: "capabilities", value: ((ml.capabilities as string[]) ?? []).join(", ") },
      ],
    });
  }

  // Map prompt layer as a component
  if (promptLayer && Object.keys(promptLayer as Record<string, unknown>).length > 0) {
    const pl = promptLayer as Record<string, unknown>;
    (cd.components as Array<Record<string, unknown>>).push({
      type: "file",
      name: "system_prompt",
      "bom-ref": "prompt-system",
      properties: [
        { name: "system_prompt_hash", value: (pl.system_prompt_hash as string) ?? "" },
        { name: "template_ids", value: ((pl.template_ids as string[]) ?? []).join(", ") },
      ],
    });
  }

  // Map permission layer to top-level properties
  const perm = permissionLayer as Record<string, unknown>;
  if (perm.granted_scopes) {
    (cd.properties as Array<Record<string, unknown>>).push({
      name: "granted_scopes",
      value: (perm.granted_scopes as string[]).join(", "),
    });
  }
  if (perm.data_access) {
    (cd.properties as Array<Record<string, unknown>>).push({
      name: "data_access",
      value: (perm.data_access as string[]).join(", "),
    });
  }
  if (perm.credential_references) {
    (cd.properties as Array<Record<string, unknown>>).push({
      name: "credential_references",
      value: (perm.credential_references as string[]).join(", "),
    });
  }

  // Map risk summary
  if (riskLayer.length > 0) {
    const high = riskLayer.filter((r) => r.severity === "high" || r.severity === "critical").length;
    const med = riskLayer.filter((r) => r.severity === "medium").length;
    const low = riskLayer.filter((r) => r.severity === "low" || r.severity === "info").length;
    (cd.properties as Array<Record<string, unknown>>).push({
      name: "risk_summary",
      value: `${riskLayer.length} risks: ${high} high/critical, ${med} medium, ${low} low/info`,
    });
  }

  // Map attestation
  (cd.properties as Array<Record<string, unknown>>).push(
    { name: "generator", value: (attestation.generator as string) ?? "" },
    { name: "generator_version", value: (attestation.generator_version as string) ?? "" },
  );

  return cd;
}

/**
 * Map an AgentBOM document to an SPDX 3.0 AI profile representation.
 */
function mapAgentBOMtoSPDX(agentbom: Record<string, unknown>): Record<string, unknown> {
  const identity = (agentbom.identity ?? {}) as Record<string, unknown>;
  const toolLayer = (agentbom.tool_layer ?? []) as Array<Record<string, unknown>>;
  const permissionLayer = (agentbom.permission_layer ?? {}) as Record<string, unknown>;
  const modelLayer = (agentbom.model_layer ?? {}) as Record<string, unknown>;
  const promptLayer = (agentbom.prompt_layer ?? {}) as Record<string, unknown>;
  const attestation = (agentbom.attestation ?? {}) as Record<string, unknown>;

  const agentSPDXID = `SPDXRef-Agent-${(identity.agent_id as string) ?? "unknown"}`;
  const packages: Array<Record<string, unknown>> = [];
  const relationships: Array<Record<string, unknown>> = [];

  // Agent package
  const agentPkg: Record<string, unknown> = {
    SPDXID: agentSPDXID,
    name: (identity.agent_name as string) ?? "unknown",
    versionInfo: (identity.agent_version as string) ?? "",
    supplier: "Organization: WasmAgent",
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: "NOASSERTION",
    description: `WasmAgent agent ${identity.agent_name ?? "unknown"}`,
    primaryPackagePurpose: "AI-AGENT",
    properties: [
      { name: "agent_id", value: (identity.agent_id as string) ?? "" },
      { name: "deployment_context", value: (identity.deployment_context as string) ?? "" },
      { name: "generated_at", value: (identity.generated_at as string) ?? "" },
    ],
  };

  // Add permissions to agent package
  const perm = permissionLayer as Record<string, unknown>;
  if (perm.granted_scopes) {
    (agentPkg.properties as Array<Record<string, unknown>>).push({
      name: "granted_scopes",
      value: (perm.granted_scopes as string[]).join(", "),
    });
  }
  if (perm.data_access) {
    (agentPkg.properties as Array<Record<string, unknown>>).push({
      name: "data_access",
      value: (perm.data_access as string[]).join(", "),
    });
  }
  if (perm.credential_references) {
    (agentPkg.properties as Array<Record<string, unknown>>).push({
      name: "credential_references",
      value: (perm.credential_references as string[]).join(", "),
    });
  }

  // Attestation properties
  (agentPkg.properties as Array<Record<string, unknown>>).push(
    { name: "generator", value: (attestation.generator as string) ?? "" },
    { name: "generator_version", value: (attestation.generator_version as string) ?? "" },
  );

  packages.push(agentPkg);

  // Model package
  if (modelLayer && (modelLayer as Record<string, unknown>).provider) {
    const ml = modelLayer as Record<string, unknown>;
    const modelSPDXID = `SPDXRef-Model-${(ml.model_id as string) ?? "unknown"}`;
    packages.push({
      SPDXID: modelSPDXID,
      name: (ml.model_id as string) ?? "unknown",
      versionInfo: (ml.model_version as string) ?? "",
      supplier: `Organization: ${(ml.provider as string) ?? "unknown"}`,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: "NOASSERTION",
      description: `${ml.provider as string} ${ml.model_id as string} model used by the agent`,
      primaryPackagePurpose: "AI-MODEL",
      properties: [
        { name: "provider", value: (ml.provider as string) ?? "" },
        { name: "capabilities", value: ((ml.capabilities as string[]) ?? []).join(", ") },
      ],
    });
    relationships.push({
      spdxElementId: agentSPDXID,
      relationshipType: "DEPENDS_ON",
      relatedSpdxElement: modelSPDXID,
      comment: "Agent depends on the AI model for inference",
    });
  }

  // Tool packages
  for (const tool of toolLayer) {
    const toolSPDXID = `SPDXRef-Tool-${(tool.tool_id as string) ?? "unknown"}`;
    packages.push({
      SPDXID: toolSPDXID,
      name: (tool.tool_name as string) ?? "unknown",
      versionInfo: "1.0",
      supplier: "NOASSERTION",
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: "NOASSERTION",
      description: `${tool.tool_name as string} tool`,
      primaryPackagePurpose: (tool.source as string) === "mcp" ? "APPLICATION" : "LIBRARY",
      properties: [
        { name: "tool_id", value: (tool.tool_id as string) ?? "" },
        { name: "source", value: (tool.source as string) ?? "" },
        { name: "permissions", value: ((tool.permissions as string[]) ?? []).join(", ") },
        { name: "risk_signals", value: ((tool.risk_signals as string[]) ?? []).join(", ") },
      ],
    });
    if (tool.mcp_server_id) {
      (packages[packages.length - 1].properties as Array<Record<string, unknown>>).push({
        name: "mcp_server_id",
        value: tool.mcp_server_id as string,
      });
    }
    relationships.push({
      spdxElementId: agentSPDXID,
      relationshipType: "CONTAINS",
      relatedSpdxElement: toolSPDXID,
      comment: `Agent contains ${tool.tool_name as string} tool`,
    });
  }

  // Prompt package
  if (promptLayer && Object.keys(promptLayer as Record<string, unknown>).length > 0) {
    const pl = promptLayer as Record<string, unknown>;
    packages.push({
      SPDXID: "SPDXRef-Prompt-system",
      name: "system_prompt",
      versionInfo: "1.0",
      supplier: "NOASSERTION",
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: "NOASSERTION",
      description: "System prompt used for agent configuration",
      primaryPackagePurpose: "FILE",
      properties: [
        { name: "system_prompt_hash", value: (pl.system_prompt_hash as string) ?? "" },
        { name: "template_ids", value: ((pl.template_ids as string[]) ?? []).join(", ") },
      ],
    });
    relationships.push({
      spdxElementId: agentSPDXID,
      relationshipType: "CONTAINS",
      relatedSpdxElement: "SPDXRef-Prompt-system",
      comment: "Agent contains system prompt configuration",
    });
  }

  return {
    spdxVersion: "SPDX-3.0",
    dataLicense: "CC0-1.0",
    name: `${(identity.agent_name as string) ?? "agent"}-bom`,
    documentNamespace: `https://github.com/WasmAgent/agent-trust-infra/${(identity.agent_id as string) ?? "unknown"}/spdx/3.0`,
    creationInfo: {
      created: (identity.generated_at as string) ?? new Date().toISOString(),
      creators: [
        "Organization: WasmAgent",
        `Tool: ${(attestation.generator as string) ?? "unknown"}-${(attestation.generator_version as string) ?? ""}`,
      ],
      comment: `AgentBOM for ${identity.agent_name as string} generated by agent-trust-infra`,
    },
    packages,
    relationships,
    annotations: [
      {
        annotationDate: (identity.generated_at as string) ?? new Date().toISOString(),
        annotationType: "AI_MODEL_CARD",
        annotator: "Tool: agent-trust-infra",
        comment: "Agent capabilities declared in AgentBOM",
      },
    ],
    documentDescribes: [agentSPDXID],
  };
}

// ---------------------------------------------------------------------------
// Schema fixtures
// ---------------------------------------------------------------------------

const CYCLONEDX_SCHEMA_PATH = resolve(SCHEMAS_DIR, "cyclonedx-ml-bom.schema.json");
const SPDX_SCHEMA_PATH = resolve(SCHEMAS_DIR, "spdx-3.0-ai-profile.schema.json");
const CYCLONEDX_SAMPLE_PATH = resolve(SCHEMAS_DIR, "cyclonedx-ml-bom-sample.json");
const SPDX_SAMPLE_PATH = resolve(SCHEMAS_DIR, "spdx-3.0-ai-profile-sample.json");

let cyclonedxValidate: ValidateFunction;
let spdxValidate: ValidateFunction;

beforeAll(() => {
  cyclonedxValidate = compileSchema(CYCLONEDX_SCHEMA_PATH);
  spdxValidate = compileSchema(SPDX_SCHEMA_PATH);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CycloneDX ML-BOM schema conformance", () => {
  it("schema fixture is loadable and valid JSON", () => {
    const schema = loadJSON(CYCLONEDX_SCHEMA_PATH);
    expect(schema).toBeTruthy();
    expect(typeof schema).toBe("object");
    const s = schema as Record<string, unknown>;
    expect(s.$schema).toMatch(/json-schema/);
    expect(s.title).toMatch(/cyclonedx/i);
  });

  it("validates the CycloneDX ML-BOM sample fixture", () => {
    const sample = loadJSON(CYCLONEDX_SAMPLE_PATH);
    const result = validateAgainst(cyclonedxValidate, sample);

    if (!result.valid) {
      console.log("CycloneDX ML-BOM validation errors:", JSON.stringify(result.fieldDetails, null, 2));
    }

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects an invalid CycloneDX document (missing bomFormat)", () => {
    const invalid = { specVersion: "1.5", version: 1 };
    const result = validateAgainst(cyclonedxValidate, invalid);

    expect(result.valid).toBe(false);
    // Should complain about missing 'bomFormat'
    const fieldNames = result.fieldDetails.map((e) => e.field);
    expect(fieldNames.some((f) => f.includes("bomFormat"))).toBe(true);
  });

  it("rejects an invalid CycloneDX document (bad specVersion)", () => {
    const invalid = { bomFormat: "CycloneDX", specVersion: "99.9", version: 1 };
    const result = validateAgainst(cyclonedxValidate, invalid);

    expect(result.valid).toBe(false);
  });

  it("reports which fields are present, absent, or incompatible", () => {
    // Start with the valid sample and remove a required field
    const sample = loadJSON(CYCLONEDX_SAMPLE_PATH) as Record<string, unknown>;
    const { bomFormat: _bomFormat, ...missingBomFormat } = sample;

    const result = validateAgainst(cyclonedxValidate, missingBomFormat);

    expect(result.valid).toBe(false);
    // Report should clearly indicate the missing field
    const messages = result.errors.join("; ");
    expect(messages).toMatch(/bomFormat/i);
    expect(result.fieldDetails.length).toBeGreaterThan(0);
  });
});

describe("SPDX 3.0 AI profile schema conformance", () => {
  it("schema fixture is loadable and valid JSON", () => {
    const schema = loadJSON(SPDX_SCHEMA_PATH);
    expect(schema).toBeTruthy();
    expect(typeof schema).toBe("object");
    const s = schema as Record<string, unknown>;
    expect(s.$schema).toMatch(/json-schema/);
    expect(s.title).toMatch(/spdx/i);
  });

  it("validates the SPDX 3.0 AI profile sample fixture", () => {
    const sample = loadJSON(SPDX_SAMPLE_PATH);
    const result = validateAgainst(spdxValidate, sample);

    if (!result.valid) {
      console.log("SPDX AI profile validation errors:", JSON.stringify(result.fieldDetails, null, 2));
    }

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects an invalid SPDX document (missing spdxVersion)", () => {
    const invalid = { dataLicense: "CC0-1.0", name: "test", creationInfo: { created: "2026-01-01T00:00:00Z" } };
    const result = validateAgainst(spdxValidate, invalid);

    expect(result.valid).toBe(false);
    const fieldNames = result.fieldDetails.map((e) => e.field);
    expect(fieldNames.some((f) => f.includes("spdxVersion"))).toBe(true);
  });

  it("rejects an invalid SPDX document (bad spdxVersion)", () => {
    const invalid = { spdxVersion: "SPDX-1.0", dataLicense: "CC0-1.0", name: "test", creationInfo: { created: "2026-01-01T00:00:00Z" } };
    const result = validateAgainst(spdxValidate, invalid);

    expect(result.valid).toBe(false);
  });

  it("reports which fields are present, absent, or incompatible", () => {
    // Start with the valid sample and remove a required field
    const sample = loadJSON(SPDX_SAMPLE_PATH) as Record<string, unknown>;
    const { spdxVersion: _spdxVersion, ...missingVersion } = sample;

    const result = validateAgainst(spdxValidate, missingVersion);

    expect(result.valid).toBe(false);
    const messages = result.errors.join("; ");
    expect(messages).toMatch(/spdxVersion/i);
    expect(result.fieldDetails.length).toBeGreaterThan(0);
  });
});

describe("CycloneDX ML-BOM sample fixture fields", () => {
  it("lists all top-level fields in the CycloneDX sample", () => {
    const sample = loadJSON(CYCLONEDX_SAMPLE_PATH) as Record<string, unknown>;
    const topFields = Object.keys(sample).sort();
    // Should have key CycloneDX fields
    expect(topFields).toContain("bomFormat");
    expect(topFields).toContain("specVersion");
    expect(topFields).toContain("version");
    expect(topFields).toContain("metadata");
    expect(topFields).toContain("components");
    console.log(`CycloneDX ML-BOM sample top-level fields: ${topFields.join(", ")}`);
  });

  it("contains ML-BOM extension properties for model metadata", () => {
    const sample = loadJSON(CYCLONEDX_SAMPLE_PATH) as Record<string, unknown>;
    const components = sample.components as Array<Record<string, unknown>>;
    const modelComp = components.find(
      (c) => c.type === "machine-learning-model",
    );
    expect(modelComp).toBeTruthy();
    const props = (modelComp!.properties ?? []) as Array<Record<string, unknown>>;
    const propNames = props.map((p) => p.name);
    expect(propNames).toContain("provider");
    expect(propNames).toContain("capabilities");
  });

  it("contains agent tool components with permission metadata", () => {
    const sample = loadJSON(CYCLONEDX_SAMPLE_PATH) as Record<string, unknown>;
    const components = sample.components as Array<Record<string, unknown>>;
    const toolComps = components.filter((c) => c.type === "library" || c.type === "application");
    expect(toolComps.length).toBeGreaterThan(0);
    // Each tool component should have a properties array with tool metadata
    for (const tc of toolComps) {
      const props = (tc.properties ?? []) as Array<Record<string, unknown>>;
      const propNames = props.map((p) => p.name);
      expect(propNames).toContain("tool_id");
      expect(propNames).toContain("source");
    }
  });
});

describe("SPDX 3.0 AI profile sample fixture fields", () => {
  it("lists all top-level fields in the SPDX sample", () => {
    const sample = loadJSON(SPDX_SAMPLE_PATH) as Record<string, unknown>;
    const topFields = Object.keys(sample).sort();
    expect(topFields).toContain("spdxVersion");
    expect(topFields).toContain("dataLicense");
    expect(topFields).toContain("name");
    expect(topFields).toContain("creationInfo");
    expect(topFields).toContain("packages");
    expect(topFields).toContain("relationships");
    console.log(`SPDX 3.0 AI profile sample top-level fields: ${topFields.join(", ")}`);
  });

  it("contains an AI-AGENT package with identity metadata", () => {
    const sample = loadJSON(SPDX_SAMPLE_PATH) as Record<string, unknown>;
    const packages = sample.packages as Array<Record<string, unknown>>;
    const agentPkg = packages.find((p) => p.primaryPackagePurpose === "AI-AGENT");
    expect(agentPkg).toBeTruthy();
    expect(agentPkg!.name).toBeTruthy();
    expect(agentPkg!.SPDXID).toMatch(/^SPDXRef-/);
  });

  it("contains an AI-MODEL package with model metadata", () => {
    const sample = loadJSON(SPDX_SAMPLE_PATH) as Record<string, unknown>;
    const packages = sample.packages as Array<Record<string, unknown>>;
    const modelPkg = packages.find((p) => p.primaryPackagePurpose === "AI-MODEL");
    expect(modelPkg).toBeTruthy();
    expect(modelPkg!.name).toBeTruthy();
    const props = (modelPkg!.properties ?? []) as Array<Record<string, unknown>>;
    const propNames = props.map((p) => p.name);
    expect(propNames).toContain("provider");
    expect(propNames).toContain("capabilities");
  });

  it("has DEPENDS_ON relationships between agent and model", () => {
    const sample = loadJSON(SPDX_SAMPLE_PATH) as Record<string, unknown>;
    const relationships = sample.relationships as Array<Record<string, unknown>>;
    const dependsOn = relationships.filter((r) => r.relationshipType === "DEPENDS_ON");
    expect(dependsOn.length).toBeGreaterThan(0);
  });
});

describe("Integration smoke test: trust-cli generate bom", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `agent-trust-schema-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generated output maps to valid CycloneDX ML-BOM", () => {
    // Use the demo agentbom fixture as the output of 'generate bom'
    const agentbom = loadJSON(DEMO_AGENTBOM) as Record<string, unknown>;
    const cyclonedx = mapAgentBOMtoCycloneDX(agentbom);

    const result = validateAgainst(cyclonedxValidate, cyclonedx);

    if (!result.valid) {
      console.log("CycloneDX mapping validation errors:", JSON.stringify(result.fieldDetails, null, 2));
      console.log("Generated CycloneDX:", JSON.stringify(cyclonedx, null, 2));
    }

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("generated output maps to valid SPDX 3.0 AI profile", () => {
    const agentbom = loadJSON(DEMO_AGENTBOM) as Record<string, unknown>;
    const spdx = mapAgentBOMtoSPDX(agentbom);

    const result = validateAgainst(spdxValidate, spdx);

    if (!result.valid) {
      console.log("SPDX mapping validation errors:", JSON.stringify(result.fieldDetails, null, 2));
      console.log("Generated SPDX:", JSON.stringify(spdx, null, 2));
    }

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("integration: generate bom via CLI yields valid CycloneDX mapping", async () => {
    const agentDir = resolve(tmpDir, "integration-agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      resolve(agentDir, "package.json"),
      JSON.stringify({ name: "@wasmagent/integration-agent", version: "1.0.0" }),
      "utf-8",
    );

    // Use the generate function from bom-generate.ts
    const mod = await import("./bom-generate.js");
    const generate = mod.generateAgentBOM;
    const bom = generate({ agentPath: agentDir });

    // Map to CycloneDX and validate
    const cyclonedx = mapAgentBOMtoCycloneDX(bom as Record<string, unknown>);
    const result = validateAgainst(cyclonedxValidate, cyclonedx);

    if (!result.valid) {
      console.log("CLI generate -> CycloneDX errors:", JSON.stringify(result.fieldDetails, null, 2));
    }

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Verify agent identity mapped correctly
    const meta = cyclonedx.metadata as Record<string, unknown>;
    const comp = meta.component as Record<string, unknown>;
    expect(comp.name).toBe("integration-agent");
    expect(comp.type).toBe("ai-agent");
  });

  it("integration: generate bom via CLI yields valid SPDX 3.0 mapping", async () => {
    const agentDir = resolve(tmpDir, "integration-spdx-agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      resolve(agentDir, "package.json"),
      JSON.stringify({ name: "@wasmagent/spdx-agent", version: "2.0.0" }),
      "utf-8",
    );

    const mod = await import("./bom-generate.js");
    const generate = mod.generateAgentBOM;
    const bom = generate({ agentPath: agentDir });

    const spdx = mapAgentBOMtoSPDX(bom as Record<string, unknown>);
    const result = validateAgainst(spdxValidate, spdx);

    if (!result.valid) {
      console.log("CLI generate -> SPDX errors:", JSON.stringify(result.fieldDetails, null, 2));
    }

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Verify agent identity
    const packages = spdx.packages as Array<Record<string, unknown>>;
    const agentPkg = packages.find((p) => p.primaryPackagePurpose === "AI-AGENT");
    expect(agentPkg).toBeTruthy();
    expect(agentPkg!.name).toBe("spdx-agent");
    expect(agentPkg!.versionInfo).toBe("2.0.0");
  });
});
