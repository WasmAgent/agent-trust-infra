/**
 * Relationship-to-wasmagent implementation-package coherence check
 * (issue #72, org-coherence patrol).
 *
 * Cross-repo coordination gap: issue #66 made `README.md` name the runtime
 * implementation packages that migrated to `wasmagent-js` — `@wasmagent/aep`
 * and `@wasmagent/mcp-attestation` — and point readers to
 * `docs/relationship-to-wasmagent.md` for "the full dependency map". But that
 * dependency-map doc still framed the MCP scanning primitives and the AEP
 * emitter as future work to be "contributed back to `wasmagent-js` once they
 * stabilize", even though both have already shipped there. A developer
 * following the README's link landed on an orphaned reference that described
 * already-shipped features as outstanding migration work — the exact
 * confusion the patrol flagged.
 *
 * The fix is to resolve the orphaned reference: acknowledge the migration has
 * happened and point to the implementation packages, mirroring the README.
 * This test is the regression guard so the drift cannot silently reappear,
 * mirroring readme-impl-package-coherence.test.ts (#66) and
 * roadmap-ledger-coherence.test.ts (#69).
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEP_MAP = join(__dirname, "../../docs/relationship-to-wasmagent.md");
const text = readFileSync(DEP_MAP, "utf-8");

/** npm package names that ship the runtime implementation of the specs here. */
const AEP_REF = "@wasmagent/aep";
const MCP_ATTESTATION_REF = "@wasmagent/mcp-attestation";

describe("relationship-to-wasmagent implementation-package coherence (issue #72)", () => {
	it("exists and has content", () => {
		expect(text.length).toBeGreaterThan(0);
	});

	it("names the AEP implementation package the AgentBOM evidence layer migrated to", () => {
		// `@wasmagent/aep` ships the AEP emitter that produces the runtime
		// evidence referenced by specs/agentbom's `evidence_layer.aep_references`.
		// The dependency map must point to where the feature lives now, not just
		// name the `wasmagent-js` runtime generically.
		expect(text).toContain(AEP_REF);
		expect(text).toContain("https://www.npmjs.com/package/@wasmagent/aep");
	});

	it("names the MCP attestation implementation package the MCP Posture primitives migrated to", () => {
		// `@wasmagent/mcp-attestation` ships the MCP posture/attestation runtime
		// (the "MCP scanning primitives") that consumes specs/mcp-posture.
		expect(text).toContain(MCP_ATTESTATION_REF);
		expect(text).toContain(
			"https://www.npmjs.com/package/@wasmagent/mcp-attestation",
		);
	});

	it("does not frame the migrated runtime primitives as outstanding future migration work", () => {
		// The orphaned reference described already-shipped features as future
		// work to be "contributed back to wasmagent-js once they stabilize".
		// That framing must not return — it confuses developers about where the
		// features live.
		expect(/contributed back/i.test(text)).toBe(false);
		expect(/once they stabilize/i.test(text)).toBe(false);
	});
});
