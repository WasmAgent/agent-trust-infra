/**
 * Boundary check (comment-driven test).
 *
 * Architectural rule enforced by docs/project-boundaries.md and the package
 * layering: `packages/*` are reusable, dependency-free reference
 * implementations and MUST NOT depend on `cli/` (the CLI depends on the
 * packages, never the other way around).
 *
 * This test scans every TypeScript file under `packages/` and fails if any
 * import specifier reaches into `cli/src/` or imports the CLI package
 * (`@wasmagent/agent-trust-cli`). Keep this test green; a failure means a
 * package gained an illegal dependency on the CLI layer.
 */
import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = resolve(__dirname, '../../packages');
const REPO_ROOT = resolve(__dirname, '../..');

/** Import specifiers that would mean a package depends on the CLI layer. */
const FORBIDDEN_SPECIFIERS = ['@wasmagent/agent-trust-cli', '@wasmagent/trust-cli'];

function listTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // Skip dependency directories (defensive; packages have none here).
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listTsFiles(full, acc);
    } else if (entry.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/** Extract all `from "..."` import specifiers from a source file. */
function importSpecifiers(src: string): string[] {
  return [...src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

/** Absolute path of the cli/ directory. */
const CLI_DIR = resolve(REPO_ROOT, 'cli');

/**
 * True if an import specifier (found in `sourceFile`) reaches the CLI layer.
 * Relative specifiers are resolved from the importing file's directory so the
 * check is correct regardless of where the package file lives.
 */
function reachesCli(spec: string, sourceFile: string): boolean {
  if (FORBIDDEN_SPECIFIERS.includes(spec)) return true;
  if (spec.startsWith('.')) {
    const resolved = resolve(dirname(sourceFile), spec);
    if (resolved === CLI_DIR || resolved.startsWith(`${CLI_DIR}/`)) return true;
  }
  // Backstop: bare references to the cli source tree.
  return /(^|\/)cli\/src\//.test(spec);
}

describe('package boundary: packages/ must not depend on cli/', () => {
  it('scans all package sources and finds no cli imports', () => {
    const files = listTsFiles(PACKAGES_DIR);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      for (const spec of importSpecifiers(src)) {
        if (reachesCli(spec, file)) {
          violations.push(`${relative(REPO_ROOT, file)} imports "${spec}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('the reachesCli detector actually flags a synthetic cli import', () => {
    // Guard against the boundary test becoming vacuous.
    const pkgFile = resolve(PACKAGES_DIR, 'agentbom-core/src/index.ts');
    expect(reachesCli('../../cli/src/index.js', pkgFile)).toBe(true);
    expect(reachesCli('@wasmagent/agent-trust-cli', pkgFile)).toBe(true);
    expect(reachesCli('@wasmagent/trust-cli', pkgFile)).toBe(true);
    expect(reachesCli('ajv', pkgFile)).toBe(false);
    expect(reachesCli('node:fs', pkgFile)).toBe(false);
  });
});
