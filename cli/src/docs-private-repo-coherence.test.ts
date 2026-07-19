/**
 * Docs private-repo reference coherence check (issue #62, org-coherence patrol).
 *
 * The WasmAgent org profile recently dropped a stale reference to the private
 * `erp-agent` repo (org profile PR #10). `agent-trust-infra` is a *public*
 * research preview, so its public-facing docs (README, `docs/`, `specs/`,
 * `papers/`, `examples/`) must never reference that private component — doing so
 * implies a dependency that no longer exists and leaks a non-public repo name
 * into the public architecture.
 *
 * An audit for issue #62 confirmed the README and roadmap currently contain no
 * such references. This test is the regression guard so the patrol's recurring
 * "orphaned reference" drift cannot silently reappear, mirroring
 * roadmap-coherence.test.ts (#57/#60) and readme-status-coherence.test.ts (#48).
 *
 * It scans `README.md` and every markdown file under the public doc trees
 * (`docs/`, `specs/`, `papers/`, `examples/`) and fails if any `erp-agent`-style
 * reference (hyphen, underscore, space, or camelCase) appears.
 */
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

/**
 * Matches the private `erp-agent` repo name in any common spacing/casing:
 * `erp-agent`, `erp_agent`, `erp agent`, `erpagent`, `ErpAgent`. Does NOT match
 * `enterprise` (no "agent" follows the embedded "erp" substring).
 */
const PRIVATE_ERP_AGENT_REF = /erp[ _-]?agent/i;

/**
 * Public doc trees whose markdown is public-facing and so must not name private
 * repos. Mirrors the repo layout in `README.md` (`docs/`, `specs/`, `papers/`,
 * `examples/`); `cli/` is intentionally excluded — it holds this regression
 * guard, which legitimately names the forbidden token in its own assertions.
 */
const SCAN_DIRS = ['docs', 'specs', 'papers', 'examples'];

/** Recursively collect markdown files under `dir` (skips build/dep dirs). */
function listMarkdownFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listMarkdownFiles(full, acc);
    } else if (entry.endsWith('.md')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Public-facing markdown surfaces that must not name private repos. */
const SCAN_FILES = [
  join(REPO_ROOT, 'README.md'),
  ...SCAN_DIRS.flatMap((d) => {
    const abs = join(REPO_ROOT, d);
    return existsSync(abs) ? listMarkdownFiles(abs) : [];
  }),
];

/** Collect readable (file, line) hits for the forbidden reference. */
function findReferences(files: string[]): { file: string; line: string }[] {
  const hits: { file: string; line: string }[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    for (const line of src.split('\n')) {
      if (PRIVATE_ERP_AGENT_REF.test(line)) {
        hits.push({ file, line: line.trim() });
      }
    }
  }
  return hits;
}

describe('docs private-repo reference coherence (issue #62)', () => {
  it('scans README.md and every public doc tree', () => {
    // Guard against the test becoming vacuous if doc paths move.
    expect(SCAN_FILES.length).toBeGreaterThan(0);
    expect(SCAN_FILES.some((f) => f.endsWith('README.md'))).toBe(true);
    expect(SCAN_FILES.some((f) => f.endsWith('docs/roadmap.md'))).toBe(true);
    // The guard must cover every public-facing doc tree, not just README +
    // docs/, so a private-repo name cannot leak into a spec, paper, or
    // example (the surfaces the org-coherence patrol audits org-wide).
    expect(SCAN_FILES.some((f) => f.includes('specs/'))).toBe(true);
    expect(SCAN_FILES.some((f) => f.includes('papers/'))).toBe(true);
    expect(SCAN_FILES.some((f) => f.includes('examples/'))).toBe(true);
  });

  it('has no orphaned `erp-agent` references in public docs', () => {
    const hits = findReferences(SCAN_FILES);
    const report = hits.map((h) => `${h.file}: ${JSON.stringify(h.line)}`).join('\n');
    expect(
      hits,
      `public docs must not reference the private erp-agent repo; found:\n${report}`,
    ).toEqual([]);
  });

  it('the PRIVATE_ERP_AGENT_REF detector actually flags erp-agent variants', () => {
    // Guard against the coherence check becoming vacuous.
    expect(PRIVATE_ERP_AGENT_REF.test('erp-agent')).toBe(true);
    expect(PRIVATE_ERP_AGENT_REF.test('ERP_Agent')).toBe(true);
    expect(PRIVATE_ERP_AGENT_REF.test('erp agent roadmap')).toBe(true);
    expect(PRIVATE_ERP_AGENT_REF.test('ErpAgent')).toBe(true);
    // Must not trip on unrelated prose containing "enterprise".
    expect(PRIVATE_ERP_AGENT_REF.test('enterprise trust questions')).toBe(false);
    expect(PRIVATE_ERP_AGENT_REF.test('Private enterprise configurations')).toBe(false);
  });
});
