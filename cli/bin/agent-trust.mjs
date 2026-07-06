#!/usr/bin/env node
/**
 * ESM entry point for the agent-trust CLI.
 *
 * This file imports the compiled dist/index.js
 * and delegates to runCommand.
 */
import { runCommand } from '../dist/index.js';

const args = process.argv.slice(2);
const exitCode = runCommand(args);
process.exit(exitCode ?? 1);
