/**
 * CycloneDX ML-BOM and SPDX 3.0 AI profile schema conformance tests (issue #172).
 *
 * Validates committed fixture samples against their respective JSON schemas.
 * This provides machine-readable conformance checks for the two external
 * SBOM standards that AgentBOM extends — CycloneDX ML-BOM and SPDX 3.0 AI
 * profile — as called for in docs/strategy.md ("Use schema conformance tests
 * rather than string-match tests on documentation").
 *
 * These tests are additive to the existing coherence tests (which guard
 * documentation accuracy) and do not replace them.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import type { ErrorObject } from "ajv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "../../test/fixtures/schemas");

/**
 * Load and parse a JSON fixture file.
 */
function loadFixture(name: string): unknown {
	const raw = readFileSync(join(FIXTURES_DIR, name), "utf-8");
	return JSON.parse(raw) as unknown;
}

/**
 * Format Ajv validation errors into a readable string.
 */
function formatErrors(errors: ErrorObject[] | null | undefined): string {
	if (!errors || errors.length === 0) return "none";
	return errors
		.map((e) => `  ${e.instancePath} ${e.message} (${e.keyword})`)
		.join("\n");
}

const ajv = new Ajv({ strict: false });

// --- CycloneDX ML-BOM conformance ---

describe("CycloneDX ML-BOM schema conformance", () => {
	const schema = loadFixture("cyclonedx-ml-bom.schema.json") as Record<
		string,
		unknown
	>;
	const validate = ajv.compile(schema);

	it("schema is a valid JSON Schema", () => {
		expect(validate.errors).toBeNull();
	});

	it("fixture sample validates against the schema", () => {
		const sample = loadFixture("cyclonedx-ml-bom-sample.json");
		const valid = validate(sample);
		expect(
			valid,
			`CycloneDX sample must conform to schema. Errors:\n${formatErrors(validate.errors)}`,
		).toBe(true);
	});

	it("sample has required top-level fields", () => {
		const sample = loadFixture("cyclonedx-ml-bom-sample.json") as Record<
			string,
			unknown
		>;
		expect(sample.bomFormat).toBe("CycloneDX");
		expect(sample.specVersion).toBe("1.5");
		expect(typeof sample.version).toBe("number");
	});

	it("sample metadata describes an ai-agent component", () => {
		const sample = loadFixture("cyclonedx-ml-bom-sample.json") as Record<
			string,
			unknown
		>;
		const metadata = sample.metadata as Record<string, unknown>;
		const component = metadata.component as Record<string, unknown>;
		expect(component.type).toBe("ai-agent");
		expect(typeof component.name).toBe("string");
	});

	it("sample components include at least one tool and one model", () => {
		const sample = loadFixture("cyclonedx-ml-bom-sample.json") as Record<
			string,
			unknown
		>;
		const components = sample.components as Array<Record<string, unknown>>;
		const types = new Set(components.map((c) => c.type));
		expect(types.has("library")).toBe(true);
		expect(types.has("machine-learning-model")).toBe(true);
	});

	it("rejects a sample missing required bomFormat", () => {
		const sample = loadFixture("cyclonedx-ml-bom-sample.json") as Record<
			string,
			unknown
		>;
		const { bomFormat, ...rest } = sample;
		expect(validate(rest)).toBe(false);
	});

	it("rejects invalid specVersion", () => {
		const sample = loadFixture("cyclonedx-ml-bom-sample.json") as Record<
			string,
			unknown
		>;
		const invalid = { ...sample, specVersion: "0.9" };
		expect(validate(invalid)).toBe(false);
	});
});

// --- SPDX 3.0 AI profile conformance ---

describe("SPDX 3.0 AI profile schema conformance", () => {
	const schema = loadFixture("spdx-3.0-ai-profile.schema.json") as Record<
		string,
		unknown
	>;
	const validate = ajv.compile(schema);

	it("schema is a valid JSON Schema", () => {
		expect(validate.errors).toBeNull();
	});

	it("fixture sample validates against the schema", () => {
		const sample = loadFixture("spdx-3.0-ai-profile-sample.json");
		const valid = validate(sample);
		expect(
			valid,
			`SPDX sample must conform to schema. Errors:\n${formatErrors(validate.errors)}`,
		).toBe(true);
	});

	it("sample has required top-level fields", () => {
		const sample = loadFixture("spdx-3.0-ai-profile-sample.json") as Record<
			string,
			unknown
		>;
		expect(sample.spdxVersion).toBe("SPDX-3.0");
		expect(sample.dataLicense).toBe("CC0-1.0");
		expect(typeof sample.name).toBe("string");
		expect(sample.creationInfo).toBeDefined();
	});

	it("sample packages include an AI-AGENT and an AI-MODEL", () => {
		const sample = loadFixture("spdx-3.0-ai-profile-sample.json") as Record<
			string,
			unknown
		>;
		const packages = sample.packages as Array<Record<string, unknown>>;
		const purposes = new Set(packages.map((p) => p.primaryPackagePurpose));
		expect(purposes.has("AI-AGENT")).toBe(true);
		expect(purposes.has("AI-MODEL")).toBe(true);
	});

	it("sample relationships use valid SPDX element references", () => {
		const sample = loadFixture("spdx-3.0-ai-profile-sample.json") as Record<
			string,
			unknown
		>;
		const relationships = sample.relationships as Array<
			Record<string, unknown>
		>;
		for (const rel of relationships) {
			expect(typeof rel.spdxElementId).toBe("string");
			expect(typeof rel.relationshipType).toBe("string");
			expect(typeof rel.relatedSpdxElement).toBe("string");
		}
	});

	it("rejects a sample missing required spdxVersion", () => {
		const sample = loadFixture("spdx-3.0-ai-profile-sample.json") as Record<
			string,
			unknown
		>;
		const { spdxVersion, ...rest } = sample;
		expect(validate(rest)).toBe(false);
	});

	it("rejects invalid SPDXID format", () => {
		const sample = loadFixture("spdx-3.0-ai-profile-sample.json") as Record<
			string,
			unknown
		>;
		const packages = (sample.packages as Array<Record<string, unknown>>).map(
			(p) => ({
				...p,
				SPDXID: "invalid-id",
			}),
		);
		const invalid = { ...sample, packages };
		expect(validate(invalid)).toBe(false);
	});
});
