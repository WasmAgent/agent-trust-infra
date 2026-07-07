#!/usr/bin/env bun
import { validatePassportCommand } from "./passport-validate.js";
import { inspectPassportCommand } from "./passport-inspect.js";
import { inspectAgentBOMCommand } from "./agentbom-inspect.js";
import { diffAgentBOMCommand } from "./agentbom-diff.js";
import { generateAgentBOMCommand } from "./bom-generate.js";
import { inspectMCPPostureCommand } from "./mcp-posture-inspect.js";
import { chainCommand } from "./chain.js";
import { complianceCheckCommand } from "./compliance-check.js";
import { auditReportCommand } from "./audit-report.js";
import { publishCommand } from "./publish.js";
import { marketplaceCommand } from "./marketplace.js";

const USAGE = [
  "Usage: agent-trust <command> [args]",
  "",
  "Commands:",
  "  chain [--example <dir>] [--out <path>]  Run the full trust chain end-to-end (offline)",
  "  passport validate <path>  Validate a trust passport file",
  "  passport inspect <path>    Inspect a trust passport file",
  "  agentbom inspect <path>    Inspect an AgentBOM file",
  "  agentbom diff <old> <new>  Diff two AgentBOM files",
  "  agentbom generate --agent <path>  Generate AgentBOM JSON from agent directory",
  "  generate bom --agent <path>  Generate AgentBOM JSON from agent directory (alias)",
  "  mcp-posture inspect <path> Inspect an MCP posture file",
  "  audit-report <bom.json>    Generate human-readable audit summary with evidence citations",
  "  compliance-check <bom.json> --profile <name>  Validate AgentBOM against compliance profile",
  "  publish <bom.json> --registry <url>  Publish agent listing to registry",
  "  marketplace [browse|inspect|verify]  Browse marketplace listings and verify trust chains",
].join("\n");

export function runCommand(args: string[]): number {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(USAGE);
    return 0;
  }

  if (args[0] === "chain") {
    return chainCommand(args.slice(1));
  }

  if (args[0] === "passport") {
    if (args[1] === "validate") {
      if (args.length < 3) {
        console.error("Error: passport validate requires a <path> argument");
        return 1;
      }
      return validatePassportCommand(args[2]);
    }
    if (args[1] === "inspect") {
      if (args.length < 3) {
        console.error("Error: passport inspect requires a <path> argument");
        return 1;
      }
      return inspectPassportCommand(args[2]);
    }
    console.error(`Error: unknown passport subcommand "${args[1]}"`);
    return 1;
  }

  if (args[0] === "agentbom") {
    if (args[1] === "inspect") {
      if (args.length < 3) {
        console.error("Error: agentbom inspect requires a <path> argument");
        return 1;
      }
      return inspectAgentBOMCommand(args[2]);
    }
    if (args[1] === "diff") {
      if (args.length < 4) {
        console.error("Error: agentbom diff requires <old> and <new> path arguments");
        return 1;
      }
      return diffAgentBOMCommand(args[2], args[3]);
    }
    if (args[1] === "generate") {
      return generateAgentBOMCommand(args.slice(2));
    }
    console.error(`Error: unknown agentbom subcommand "${args[1]}"`);
    return 1;
  }

  if (args[0] === "mcp-posture") {
    if (args[1] === "inspect") {
      if (args.length < 3) {
        console.error("Error: mcp-posture inspect requires a <path> argument");
        return 1;
      }
      return inspectMCPPostureCommand(args[2]);
    }
    console.error(`Error: unknown mcp-posture subcommand "${args[1]}"`);
    return 1;
  }

  if (args[0] === "generate") {
    if (args[1] === "bom") {
      return generateAgentBOMCommand(args.slice(2));
    }
    console.error(`Error: unknown generate subcommand "${args[1]}"`);
    return 1;
  }

  if (args[0] === "audit-report") {
    if (args.length < 2) {
      console.error("Error: audit-report requires a <bom.json> argument");
      return 1;
    }
    return auditReportCommand(args.slice(1));
  }

  if (args[0] === "compliance-check") {
    return complianceCheckCommand(args.slice(1));
  }

  if (args[0] === "publish") {
    // Publish is async - return a promise that will be awaited in main
    return publishCommand(args.slice(1)) as unknown as number;
  }

  if (args[0] === "marketplace") {
    // Marketplace is async - return a promise that will be awaited in main
    return marketplaceCommand(args.slice(1)) as unknown as number;
  }

  console.error(`Error: unknown command "${args[0]}"`);
  return 1;
}

// Internal async runner that handles both sync and async commands
async function runCommandAsync(args: string[]): Promise<number> {
  const result = runCommand(args);
  // If result is a Promise, await it; otherwise return as-is
  if (result instanceof Promise) {
    return await result;
  }
  return result;
}

// Only auto-run main when executed directly (not when imported for testing)
const isDirectRun = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isDirectRun) {
  const args = process.argv.slice(2);
  runCommandAsync(args).then((exitCode) => {
    process.exit(exitCode);
  }).catch((error) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
