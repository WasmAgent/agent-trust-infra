/**
 * Tests for the fix-shebang build helper.
 *
 * The script replaces `#!/usr/bin/env bun` with `#!/usr/bin/env node`
 * in the bundled output so the CLI works with any Node.js >= 18 runtime.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FIX_SHEBANG = join(import.meta.dir, '../scripts/fix-shebang.mjs');

describe('fix-shebang.mjs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'fix-shebang-'));
  });

  afterEach(() => {
    // Best-effort cleanup.
    try {
      unlinkSync(join(tmpDir, 'out.js'));
    } catch {
      // ignore
    }
  });

  it('replaces #!/usr/bin/env bun with #!/usr/bin/env node', () => {
    const out = join(tmpDir, 'out.js');
    writeFileSync(out, '#!/usr/bin/env bun\nconsole.log("hi");\n');
    execSync(`node ${FIX_SHEBANG} ${out}`);
    const result = readFileSync(out, 'utf8');
    expect(result.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(result).not.toContain('#!/usr/bin/env bun');
  });

  it('leaves shebang unchanged when already #!/usr/bin/env node', () => {
    const out = join(tmpDir, 'out.js');
    const original = '#!/usr/bin/env node\nconsole.log("hi");\n';
    writeFileSync(out, original);
    execSync(`node ${FIX_SHEBANG} ${out}`);
    const result = readFileSync(out, 'utf8');
    expect(result).toBe(original);
  });

  it('does nothing when no shebang is present', () => {
    const out = join(tmpDir, 'out.js');
    const original = 'console.log("hi");\n';
    writeFileSync(out, original);
    execSync(`node ${FIX_SHEBANG} ${out}`);
    const result = readFileSync(out, 'utf8');
    expect(result).toBe(original);
  });

  it('exits with code 1 when no file argument is provided', () => {
    expect(() => {
      execSync(`node ${FIX_SHEBANG}`, { stdio: 'pipe' });
    }).toThrow();
  });
});
