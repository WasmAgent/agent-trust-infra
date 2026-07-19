/**
 * Roadmap status/ledger coherence check (issue #69, org-coherence patrol).
 *
 * Cross-repo coordination gap: the `agent-trust-infra` roadmap marks the
 * Weeks 0–12 milestones "Shipped / Closed", yet this repository is and remains
 * a public research preview (decision-log mandate). Read across the
 * WasmAgent org, "Shipped / Closed" alone could be mistaken for production
 * readiness — and sibling repos (`wasmagent`, `.github`) have already removed
 * references to the migrated features, so the only canonical, cross-org record
 * of the project's public production status is the `wasmagent` Release Ledger.
 *
 * The fix is to consolidate the status in this roadmap: tie "Shipped / Closed"
 * explicitly to the research-preview deliverables (not production) and point to
 * the `wasmagent` Release Ledger as the single source of truth so the repos
 * cannot drift apart. This test reads `docs/roadmap.md` and fails if that
 * consolidation regresses, mirroring roadmap-coherence.test.ts (#57/#60) and
 * readme-status-coherence.test.ts (#48).
 */
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROADMAP = join(__dirname, '../../docs/roadmap.md');
const text = readFileSync(ROADMAP, 'utf-8');

/**
 * The leading `> **Status: ...**` blockquote lines — the public status banner
 * where the patrol's divergence is visible to a cross-repo reader.
 */
const statusBlock = text
  .split('\n')
  .filter((line) => line.startsWith('>'))
  .join('\n');

describe('roadmap status/ledger coherence (issue #69)', () => {
  it('exists and has content', () => {
    expect(text.length).toBeGreaterThan(0);
  });

  it('has a leading status blockquote', () => {
    // Guard against the check becoming vacuous if the banner is removed.
    expect(statusBlock.length).toBeGreaterThan(0);
  });

  it('consolidates production status: ships the milestones alongside the research-preview positioning', () => {
    // "Shipped / Closed" must not float free of the research-preview framing
    // — that is the exact divergence the patrol flagged. The status banner
    // must carry both the shipped-milestone language and the research-preview
    // positioning so a cross-repo reader cannot mistake "shipped" for
    // "production ready".
    expect(/shipped|closed/i.test(statusBlock)).toBe(true);
    expect(/research preview/i.test(statusBlock)).toBe(true);
  });

  it('does not claim production readiness in the status banner', () => {
    // Consolidating the status means reaffirming it is NOT production. The
    // decision-log bans production-readiness claims, so the status banner must
    // not assert production readiness / general availability either.
    expect(/production[ -]ready|generally available|\bGA\b/i.test(statusBlock)).toBe(false);
  });

  it('points to the wasmagent Release Ledger as the cross-org status source of truth', () => {
    // Sibling repos removed references to the migrated features; the canonical
    // cross-organization record of the project's public production status is
    // the `wasmagent` Release Ledger. The roadmap must name it so this repo
    // defers to a single source and the two repos cannot diverge.
    expect(/release ledger/i.test(text)).toBe(true);
    expect(/wasmagent/i.test(text)).toBe(true);
  });
});
