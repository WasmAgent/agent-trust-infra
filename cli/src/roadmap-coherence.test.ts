/**
 * Roadmap coherence check (issues #57 / #60, org-coherence patrol).
 *
 * The `wasmagent` project lists the AgentBOM, MCP Posture, and Trust Passport
 * specifications as 'Published', and its release ledger confirms the
 * Weeks 0–12 deliverables — the spec skeletons, working examples, and the
 * end-to-end demo — are Shipped. The `agent-trust-infra` roadmap must agree:
 * every Weeks 0–12 deliverable must be marked 'Shipped' or 'Closed', never
 * carried as outstanding/in-flight work or described with an 'In Progress'
 * status.
 *
 * The patrol re-filed (#60) after an earlier filing (#57): the roadmap is the
 * recurring drift surface. This test reads `docs/roadmap.md` and fails if any
 * Weeks 0–12 deliverable — including the spec skeletons ("Skeleton Specs
 * Task") or the Weeks 6–12 close-out — reappears as outstanding work, or if
 * the shipped milestones are ever labelled 'In Progress'.
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

	it("does not list any Weeks 0–12 deliverable (incl. spec skeletons) as outstanding (issue #60)", () => {
		// The whole Weeks 0–12 scope — repo/spec skeletons, working examples,
		// and the end-to-end demo — is Shipped. None of it may reappear as an
		// unchecked (`- [ ]`) item. The patrol (#60) specifically flagged a
		// "Skeleton Specs Task" and open Week 0–12 items lingering in the
		// roadmap; this guards against that broader drift.
		const weekOrSkeleton = /weeks?\s*\d|skeleton/i;
		const stray = uncheckedItems.filter((item) => weekOrSkeleton.test(item));
		expect(stray).toEqual([]);
	});

	it("does not describe the shipped milestones as 'In Progress' (issue #60)", () => {
		// The roadmap's status for the Shipped Weeks 0–12 milestones must never
		// read 'In Progress'; it must reflect the Shipped/Closed state recorded
		// in the `wasmagent` release ledger. (Genuine future work in the
		// 'In-flight / future work' section is unaffected.)
		expect(text).not.toMatch(/in[ -]?progress/i);
	});

	it("does not reference the private `erp-agent` repo (issue #62)", () => {
		// The WasmAgent org profile dropped its stale erp-agent reference (PR #10
		// in `.github`). This public repo's roadmap must not leak that private
		// component name or imply a dependency on it. The regex tolerates
		// `erp-agent`/`erp_agent`/`erp agent`/`erpagent`/`ErpAgent` but not
		// unrelated prose such as "enterprise".
		expect(/erp[ _-]?agent/i.test(text)).toBe(false);
	});
});
