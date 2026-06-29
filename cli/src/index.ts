#!/usr/bin/env bun
import { validatePassportCommand } from "./passport-validate.js";
import { inspectPassportCommand } from "./passport-inspect.js";

const USAGE = [
  "Usage: agent-trust <command> [args]",
  "",
  "Commands:",
  "  passport validate <path>  Validate a trust passport file",
  "  passport inspect <path>    Inspect a trust passport file",
].join("\n");

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  if (args[0] === "passport") {
    if (args[1] === "validate") {
      if (args.length < 3) {
        console.error("Error: passport validate requires a <path> argument");
        process.exit(1);
      }
      const exitCode = validatePassportCommand(args[2]);
      process.exit(exitCode);
    }
    if (args[1] === "inspect") {
      if (args.length < 3) {
        console.error("Error: passport inspect requires a <path> argument");
        process.exit(1);
      }
      const exitCode = inspectPassportCommand(args[2]);
      process.exit(exitCode);
    }
    console.error(`Error: unknown passport subcommand "${args[1]}"`);
    process.exit(1);
  }

  console.error(`Error: unknown command "${args[0]}"`);
  process.exit(1);
}

main();
