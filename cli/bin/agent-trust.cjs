#!/usr/bin/env node
/**
 * Entry point for the agent-trust CLI.
 *
 * This CommonJS wrapper dynamically imports the ESM module
 * from the compiled dist/index.js and delegates to runCommand.
 */

// Use dynamic import to load ESM module from CJS
async function main() {
  try {
    const dist = await import('../dist/index.js');
    const args = process.argv.slice(2);
    const exitCode = dist.runCommand(args);
    process.exit(exitCode ?? 1);
  } catch (error) {
    console.error('Failed to load agent-trust CLI module:', error.message);
    console.error('Make sure the CLI is properly built.');
    process.exit(1);
  }
}

main();
