#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

// Get the absolute path to the TypeScript entry point
const cliPath = path.join(__dirname, '..', 'src', 'index.ts');

// Spawn bun to execute the TypeScript file
const bun = spawn('bun', [cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit'
});

bun.on('exit', (code) => {
  process.exit(code ?? 1);
});
