/**
 * Roadmap coherence check (issue #57, org-coherence patrol).
 *
 * The `wasmagent` project lists the AgentBOM, MCP Posture, and Trust Passport
 * specifications as 'Published'. The `agent-trust-infra` roadmap must agree:
 * every Weeks 0–12 deliverable — including the Weeks 6–12 close-out
 * (end-to-end chain visualization and runnable demo) — must be marked as
 * 'Shipped' or 'Closed', never as outstanding/in-flight work.
 *
 * The patrol filed this issue because the roadmap had drifted back to marking
 * the close-out as 'In-flight'. This test reads `docs/roadmap.md` and fails if
 * that drift recurs.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROADMAP = join(__dirname, "../../docs/roadmap.md");
const text = readFileSync(ROADMAP, "utf-8");

/** All unchecked (`- [ ]`) roadmap items — these are the only outstanding tasks. */
const uncheckedItems = [...text.matchAll(/^-\s*\[[ ]\]\s+(.+)$/gm)].map((m) =>
	m[1].trim(),
);

describe("roadmap coherence (issue #57)", () => {
	it("exists and has content", () => {
		expect(text.length).toBeGreaterThan(0);
	});

	it("marks all Weeks 0–12 deliverables as Shipped or Closed", () => {
		// The roadmap must explicitly claim the Weeks 0–12 milestones are
		// shipped/closed, matching the 'Published' status in `wasmagent`.
		expect(/weeks\s*0[–-]12/i.test(text)).toBe(true);
		expect(/(shipped|closed)/i.test(text)).toBe(true);
	});

	it("itemizes the Weeks 0–12 milestones as checked (shipped) deliverables", () => {
		// Each Weeks 0–12 phase must appear as a checked `- [x]` deliverable.
		const checked = [...text.matchAll(/^-\s*\[[xX]\]\s+(.+)$/gm)].map((m) =>
			m[1].trim(),
		);
		const joined = checked.join("\n");
		expect(joined).toMatch(/weeks\s*0[–-]2/i);
		expect(joined).toMatch(/weeks\s*2[–-]6/i);
		expect(joined).toMatch(/weeks\s*6[–-]12/i);
	});

	it("does not list the Weeks 6–12 close-out as outstanding work", () => {
		// The end-to-end chain visualization / runnable demo must never appear
		// as an unchecked (`- [ ]`) roadmap item — that is the exact drift the
		// patrol flagged.
		const closeOut =
			/(end-to-end|end to end|chain visualization|runnable demo)/i;
		const stray = uncheckedItems.filter((item) => closeOut.test(item));
		expect(stray).toEqual([]);
	});
});
