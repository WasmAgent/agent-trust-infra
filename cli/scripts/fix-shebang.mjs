#!/usr/bin/env node
/**
 * Cross-platform shebang fixer.
 *
 * Replaces `#!/usr/bin/env bun` with `#!/usr/bin/env node` in the
 * bundled output so the CLI works with any Node.js >= 18 runtime.
 *
 * Usage:  node scripts/fix-shebang.mjs <file>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  process.stderr.write('Usage: fix-shebang.mjs <file>\n');
  process.exit(1);
}

const src = readFileSync(file, 'utf8');
const fixed = src.replace('#!/usr/bin/env bun', '#!/usr/bin/env node');
if (fixed === src) {
  // Nothing to replace — shebang already correct or absent.
  process.exit(0);
}
writeFileSync(file, fixed);
