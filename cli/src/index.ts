#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getLatestVersion as getLatestAgentBOMVersion,
  getSupportedVersions as getSupportedAgentBOMVersions,
  migrateAgentBOM,
} from '../../packages/agentbom-core/src/index.js';
import {
  getLatestVersion as getLatestPostureVersion,
  getSupportedVersions as getSupportedPostureVersions,
  migrateMCPPosture,
} from '../../packages/mcp-posture-core/src/index.js';
import { diffAgentBOMCommand } from './agentbom-diff.js';
import { inspectAgentBOMCommand } from './agentbom-inspect.js';
import { agentbomPipelineCommand } from './agentbom-pipeline.js';
import { auditReportCommand } from './audit-report.js';
import { generateAgentBOMCommand } from './bom-generate.js';
import { chainCommand } from './chain.js';
import { complianceCheckCommand } from './compliance-check.js';
import { exportDashboardCommand } from './export-dashboard.js';
import { diffMCPPostureCommand } from './mcp-posture-diff.js';
import { inspectMCPPostureCommand } from './mcp-posture-inspect.js';
import { validateMCPPostureCommand } from './mcp-posture-validate.js';
import { inspectPassportCommand } from './passport-inspect.js';
import { signPassportCommand } from './passport-sign.js';
import { validatePassportCommand } from './passport-validate.js';
import { verifySignedPassportCommand } from './passport-verify-signed.js';

const USAGE = [
  'Usage: agent-trust <command> [args]',
  '',
  'Commands:',
  '  chain [--example <dir>] [--out <path>]  Run the full trust chain end-to-end (offline)',
  '  passport validate <path>  Validate a trust passport file',
  '  passport inspect <path>    Inspect a trust passport file',
  '  passport sign <path> --key <key-path>  Sign a passport as JWT (EdDSA)',
  '  passport verify-signed <jwt-path> [--key <pubkey>]  Verify a signed passport JWT',
  '  agentbom inspect <path>    Inspect an AgentBOM file',
  '  agentbom diff <old> <new>  Diff two AgentBOM files',
  '  agentbom pipeline <path> [--partitions N] [--no-incremental]  Stream-process BOM artifacts',
  '  agentbom generate --agent <path>  Generate AgentBOM JSON from agent directory',
  '  generate bom --agent <path>  Generate AgentBOM JSON from agent directory (alias)',
  '  agentbom migrate <path> [--target <ver>] [--dry-run]  Migrate AgentBOM to target schema version',
  '  mcp-posture inspect <path>    Inspect an MCP posture file',
  '  mcp-posture validate <path>  Validate an MCP posture file',
  '  mcp-posture diff <old> <new> Diff two MCP posture snapshots',
  '  mcp-posture migrate <path> [--target <ver>] [--dry-run]  Migrate MCP Posture to target schema version',
  '  audit-report <bom.json>    Generate human-readable audit summary with evidence citations',
  '  compliance-check <bom.json> --profile <name> [--min-score <score>]  Validate AgentBOM against compliance profile with adaptive weighted scoring',
  '  export-dashboard <bom.json> --output <dir>  Generate static HTML dashboard',
].join('\n');

/** Parse --target and --dry-run flags from a CLI arg slice. */
function parseMigrateArgs(args: string[]): { filePath: string; target?: string; dryRun: boolean } {
  let filePath = '';
  let target: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && i + 1 < args.length) {
      target = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (!args[i].startsWith('--')) {
      filePath = args[i];
    }
  }

  return { filePath, target, dryRun };
}

/** Read and parse a JSON file, returning an error code on failure. */
function readJsonFile(filePath: string): { data: Record<string, unknown>; error: number } {
  const resolved = resolve(filePath);
  let raw: string;
  try {
    raw = readFileSync(resolved, 'utf-8');
  } catch {
    console.error(`Error: cannot read file "${resolved}"`);
    return { data: {}, error: 1 };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`Error: "${resolved}" is not valid JSON`);
    return { data: {}, error: 1 };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    console.error(`Error: "${resolved}" does not contain a JSON object`);
    return { data: {}, error: 1 };
  }
  return { data: data as Record<string, unknown>, error: 0 };
}

function agentbomMigrateCommand(args: string[]): number {
  const { filePath, target, dryRun } = parseMigrateArgs(args);
  if (!filePath) {
    console.error('Error: agentbom migrate requires a <path> argument');
    return 1;
  }

  const { data, error } = readJsonFile(filePath);
  if (error) return error;

  const agentbomLatest = `v${getLatestAgentBOMVersion()} (latest)`;
  console.log(
    `AgentBOM migration: v${data.agentbom_version ?? 'unknown'} → ${target ?? agentbomLatest}`,
  );
  console.log(`  Supported versions: ${getSupportedAgentBOMVersions().join(', ')}`);

  const result = migrateAgentBOM(data, target);

  if (!result.success) {
    console.error('  Migration failed:');
    for (const e of result.errors) console.error(`    - ${e}`);
    return 1;
  }

  if (result.stepsApplied.length === 0) {
    console.log('  Already at target version — no migration needed.');
  } else {
    for (const step of result.stepsApplied) {
      const breaking = step.breaking ? ' (breaking)' : '';
      console.log(
        `  Step: ${step.fromVersion} → ${step.toVersion}: ${step.description}${breaking}`,
      );
    }
  }

  for (const w of result.warnings) {
    console.warn(`  Warning: ${w}`);
  }

  if (dryRun) {
    console.log('  (dry-run — no output written)');
    return 0;
  }

  console.log(JSON.stringify(result.data, null, 2));
  return 0;
}

function postureMigrateCommand(args: string[]): number {
  const { filePath, target, dryRun } = parseMigrateArgs(args);
  if (!filePath) {
    console.error('Error: mcp-posture migrate requires a <path> argument');
    return 1;
  }

  const { data, error } = readJsonFile(filePath);
  if (error) return error;

  const postureLatest = `v${getLatestPostureVersion()} (latest)`;
  console.log(
    `MCP Posture migration: v${data.posture_version ?? 'unknown'} → ${target ?? postureLatest}`,
  );
  console.log(`  Supported versions: ${getSupportedPostureVersions().join(', ')}`);

  const result = migrateMCPPosture(data, target);

  if (!result.success) {
    console.error('  Migration failed:');
    for (const e of result.errors) console.error(`    - ${e}`);
    return 1;
  }

  if (result.stepsApplied.length === 0) {
    console.log('  Already at target version — no migration needed.');
  } else {
    for (const step of result.stepsApplied) {
      const breaking = step.breaking ? ' (breaking)' : '';
      console.log(
        `  Step: ${step.fromVersion} → ${step.toVersion}: ${step.description}${breaking}`,
      );
    }
  }

  for (const w of result.warnings) {
    console.warn(`  Warning: ${w}`);
  }

  if (dryRun) {
    console.log('  (dry-run — no output written)');
    return 0;
  }

  console.log(JSON.stringify(result.data, null, 2));
  return 0;
}

export function runCommand(args: string[]): number | Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE);
    return 0;
  }

  if (args[0] === 'chain') {
    return chainCommand(args.slice(1));
  }

  if (args[0] === 'passport') {
    if (args[1] === 'validate') {
      if (args.length < 3) {
        console.error('Error: passport validate requires a <path> argument');
        return 1;
      }
      return validatePassportCommand(args[2]);
    }
    if (args[1] === 'inspect') {
      if (args.length < 3) {
        console.error('Error: passport inspect requires a <path> argument');
        return 1;
      }
      return inspectPassportCommand(args[2]);
    }
    if (args[1] === 'sign') {
      return signPassportCommand(args.slice(2));
    }
    if (args[1] === 'verify-signed') {
      return verifySignedPassportCommand(args.slice(2));
    }
    console.error(`Error: unknown passport subcommand "${args[1]}"`);
    return 1;
  }

  if (args[0] === 'agentbom') {
    if (args[1] === 'inspect') {
      if (args.length < 3) {
        console.error('Error: agentbom inspect requires a <path> argument');
        return 1;
      }
      return inspectAgentBOMCommand(args[2]);
    }
    if (args[1] === 'diff') {
      if (args.length < 4) {
        console.error('Error: agentbom diff requires <old> and <new> path arguments');
        return 1;
      }
      return diffAgentBOMCommand(args[2], args[3]);
    }
    if (args[1] === 'generate') {
      return generateAgentBOMCommand(args.slice(2));
    }
    if (args[1] === 'pipeline') {
      return agentbomPipelineCommand(args.slice(2));
    }
    if (args[1] === 'migrate') {
      if (args.length < 3) {
        console.error('Error: agentbom migrate requires a <path> argument');
        return 1;
      }
      return agentbomMigrateCommand(args.slice(2));
    }
    console.error(`Error: unknown agentbom subcommand "${args[1]}"`);
    return 1;
  }

  if (args[0] === 'mcp-posture') {
    if (args[1] === 'inspect') {
      if (args.length < 3) {
        console.error('Error: mcp-posture inspect requires a <path> argument');
        return 1;
      }
      return inspectMCPPostureCommand(args[2]);
    }
    if (args[1] === 'validate') {
      if (args.length < 3) {
        console.error('Error: mcp-posture validate requires a <path> argument');
        return 1;
      }
      return validateMCPPostureCommand(args[2]);
    }
    if (args[1] === 'diff') {
      if (args.length < 4) {
        console.error('Error: mcp-posture diff requires <old> and <new> path arguments');
        return 1;
      }
      return diffMCPPostureCommand(args[2], args[3]);
    }
    if (args[1] === 'migrate') {
      if (args.length < 3) {
        console.error('Error: mcp-posture migrate requires a <path> argument');
        return 1;
      }
      return postureMigrateCommand(args.slice(2));
    }
    console.error(`Error: unknown mcp-posture subcommand "${args[1]}"`);
    return 1;
  }

  if (args[0] === 'generate') {
    if (args[1] === 'bom') {
      return generateAgentBOMCommand(args.slice(2));
    }
    console.error(`Error: unknown generate subcommand "${args[1]}"`);
    return 1;
  }

  if (args[0] === 'audit-report') {
    if (args.length < 2) {
      console.error('Error: audit-report requires a <bom.json> argument');
      return 1;
    }
    return auditReportCommand(args.slice(1));
  }

  if (args[0] === 'compliance-check') {
    return complianceCheckCommand(args.slice(1));
  }

  if (args[0] === 'export-dashboard') {
    return exportDashboardCommand(args.slice(1));
  }

  console.error(`Error: unknown command "${args[0]}"`);
  return 1;
}

// Only auto-run main when executed directly (not when imported for testing)
const isDirectRun = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isDirectRun) {
  const args = process.argv.slice(2);
  const result = runCommand(args);
  if (result instanceof Promise) {
    result
      .then((code) => process.exit(code))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  } else {
    process.exit(result);
  }
}
