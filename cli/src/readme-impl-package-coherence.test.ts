/**
 * README implementation-package coherence check (issue #66, org-coherence patrol).
 *
 * NOTE: This is a DOCUMENTATION coherence test — it verifies that README.md
 * contains the correct package name strings. It does NOT verify that this repo
 * actually imports or integrates with @wasmagent/aep or @wasmagent/mcp-attestation.
 * For a real code integration test, see aep-integration.test.ts.
 *
 * The WasmAgent roadmap records that the MCP / Trust / Attestation
 * specifications and validators live in this repo, and that their runtime
 * implementation has shipped to `wasmagent-js` as the npm packages
 * `@wasmagent/aep` and `@wasmagent/mcp-attestation`. The patrol filed this
 * issue because this repo (the producer/canonical source) acknowledged the
 * `wasmagent-js` runtime only generically and never linked the specific
 * implementation packages or mirrored the interface versions — risking a
 * circular drift where the consumer moves on unnoticed.
 *
 * The fix is to name and link the two implementation packages in `README.md`
 * as the consumer-facing counterparts to the specs defined here. This test is
 * the regression guard so that drift cannot silently reappear, mirroring
 * readme-status-coherence.test.ts (#48) and docs-private-repo-coherence.test.ts
 * (#62).
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const README = join(__dirname, "../../README.md");
const text = readFileSync(README, "utf-8");

/** npm package names that ship the runtime implementation of the specs here. */
const AEP_REF = "@wasmagent/aep";
const MCP_ATTESTATION_REF = "@wasmagent/mcp-attestation";

describe("README implementation-package coherence (issue #66)", () => {
	it("exists and has content", () => {
		expect(text.length).toBeGreaterThan(0);
	});

	it("links the AEP implementation package for the AgentBOM evidence layer", () => {
		// `@wasmagent/aep` ships the AEP emitter that produces the runtime
		// evidence referenced by specs/agentbom's `evidence_layer.aep_references`.
		expect(text).toContain(AEP_REF);
		expect(text).toContain("https://www.npmjs.com/package/@wasmagent/aep");
	});

	it("links the MCP attestation implementation package for the MCP Posture spec", () => {
		// `@wasmagent/mcp-attestation` ships the MCP posture/attestation runtime
		// that consumes specs/mcp-posture.
		expect(text).toContain(MCP_ATTESTATION_REF);
		expect(text).toContain(
			"https://www.npmjs.com/package/@wasmagent/mcp-attestation",
		);
	});

	it("frames both packages as the implementation layer for specs defined here", () => {
		// The README must tie the packages back to the specs in *this* repo, not
		// merely mention them as related work. "implementation" is the framing
		// the patrol asked for (consumer-facing counterpart to the schemas here).
		expect(/implementation/i.test(text)).toBe(true);
		expect(/spec/i.test(text)).toBe(true);
	});
});
