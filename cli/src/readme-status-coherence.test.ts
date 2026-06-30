/**
 * README status coherence check (issue #48, org-coherence patrol).
 *
 * The end-to-end bscode trust demo is shipped (merged implementation PRs and
 * the Weeks 6–12 close-out, recorded in the Changelog). The README's top-level
 * status banner must reflect that the demo is complete — not merely label the
 * project as an experimental research preview with the close-out left implied
 * as outstanding.
 *
 * The patrol filed this issue because the status banner had not been updated
 * after the demo shipped. This test reads `README.md` and fails if that drift
 * recurs. The research-preview positioning itself is mandated by
 * `docs/decision-log.md` and must be preserved.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const README = join(__dirname, "../../README.md");
const text = readFileSync(README, "utf-8");

/** The top-level `> **Status: ...**` banner line. */
const statusLine =
	text.split("\n").find((line) => /^>\s*\*\*Status:/i.test(line)) ?? "";

describe("README status coherence (issue #48)", () => {
	it("exists and has content", () => {
		expect(text.length).toBeGreaterThan(0);
	});

	it("has a top-level status banner", () => {
		expect(statusLine.length).toBeGreaterThan(0);
	});

	it("status banner reflects that the end-to-end demo is shipped", () => {
		// The status banner must indicate the demo is complete/shipped, matching
		// the merged demo implementation and the roadmap/CHANGELOG close-out.
		expect(statusLine).toMatch(/(shipped|complete|done)/i);
	});

	it("preserves the research-preview positioning (decision-log mandate)", () => {
		// docs/decision-log.md mandates "experimental research preview" language
		// with no production claims — the shipped-demo status must not drop it.
		expect(/research preview/i.test(text)).toBe(true);
	});
});
