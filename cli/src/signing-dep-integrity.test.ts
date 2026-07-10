/**
 * Signing dependency integrity regression guard (issue #133).
 *
 * Code-review sweep flagged that @wasmagent/aep is the trust anchor for
 * passport signing. The lock file MUST record an exact version and sha512
 * integrity hash so that supply-chain attacks (typosquatting, compromised
 * author account) cannot silently swap the signing library.
 *
 * This test reads bun.lock (not package.json ranges) because the lock file
 * is what bun actually resolves — it is the real pin.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const lockfileContent = readFileSync(join(__dirname, "../../bun.lock"), "utf-8");

/**
 * bun.lock is JSON5 (trailing commas, unquoted keys) which JSON.parse rejects.
 * Extract the @wasmagent/aep package entry via regex rather than parsing
 * the entire file. The entry line looks like:
 *   "@wasmagent/aep": ["@wasmagent/aep@1.8.0", "", { ... }, "sha512-..."],
 */
const AEP_ENTRY_RE = /"@wasmagent\/aep":\s*\[(.+?)\]\s*,?\s*$/ms;
const match = AEP_ENTRY_RE.exec(lockfileContent);

function parseAepEntry(): unknown[] {
  if (!match) throw new Error("@wasmagent/aep entry not found in bun.lock");
  return JSON.parse(`[${match[1]}]`);
}

describe("signing dependency integrity (issue #133)", () => {
  it("bun.lock contains an entry for @wasmagent/aep", () => {
    expect(match).not.toBeNull();
  });

  it("pins @wasmagent/aep to an exact version (no range)", () => {
    const entry = parseAepEntry();
    const pkgId = entry[0] as string;
    // Must be exact version like "@wasmagent/aep@1.8.0", never a range
    expect(pkgId).toMatch(/^@wasmagent\/aep@\d+\.\d+\.\d+$/);
  });

  it("records a sha512 integrity checksum for @wasmagent/aep", () => {
    const entry = parseAepEntry();
    const integrity = entry[3] as string;
    expect(typeof integrity).toBe("string");
    expect(integrity).toMatch(/^sha512-[A-Za-z0-9+/=]+$/);
  });

  it("@wasmagent/aep entry has expected structure (id, uri, deps, integrity)", () => {
    const entry = parseAepEntry();
    expect(Array.isArray(entry)).toBe(true);
    expect(entry.length).toBeGreaterThanOrEqual(4);
  });
});
