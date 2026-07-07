#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * CLI command: agent-trust attest <action>
 *
 * Generates a signed attestation for audit log inclusion.
 *
 * Usage:
 *   agent-trust attest <action> [--actor <id>] [--resource <id>] [--outcome <status>] [--details <json>]
 *
 * Example:
 *   agent-trust attest tool_call --actor "agent-123" --resource "file-read" --outcome "success"
 *
 * The command outputs a JSON object representing an audit log entry with attestation
 * (SHA-256 hash) that can be appended to an AgentBOM's audit_log array.
 */

interface AttestOptions {
  action: string;
  actor?: string;
  resource?: string;
  outcome?: "success" | "failure" | "partial";
  details?: Record<string, unknown>;
}

interface ParsedAttestArgs {
  action: string;
  actor?: string;
  resource?: string;
  outcome?: "success" | "failure" | "partial";
  details?: Record<string, unknown>;
  errorMessage?: string;
}

const USAGE = [
  "Usage: agent-trust attest <action> [options]",
  "",
  "Generates a signed attestation for audit log inclusion.",
  "",
  "Arguments:",
  "  action              Type of audit event (e.g., tool_call, permission_check, prompt_injection_attempt)",
  "",
  "Options:",
  "  --actor <id>        Entity that performed the action (user ID, system component, or external service)",
  "  --resource <id>     Target resource identifier affected by the event",
  "  --outcome <status>  Event outcome status: success, failure, or partial",
  "  --details <json>    Additional event-specific context as JSON string",
  "",
  "Example:",
  "  agent-trust attest tool_call --actor agent-123 --resource file-read --outcome success",
].join("\n");

/**
 * Parse command-line arguments for the attest command
 */
function parseAttestArgs(args: string[]): ParsedAttestArgs | null {
  if (args.length === 0) {
    return { errorMessage: "Error: attest requires an <action> argument" };
  }

  const action = args[0];
  const parsed: ParsedAttestArgs = { action };

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--actor") {
      parsed.actor = args[i + 1];
      i += 2;
    } else if (arg === "--resource") {
      parsed.resource = args[i + 1];
      i += 2;
    } else if (arg === "--outcome") {
      const outcome = args[i + 1];
      if (outcome !== "success" && outcome !== "failure" && outcome !== "partial") {
        return { errorMessage: `Error: outcome must be one of: success, failure, partial (got: ${outcome})` };
      }
      parsed.outcome = outcome as "success" | "failure" | "partial";
      i += 2;
    } else if (arg === "--details") {
      try {
        parsed.details = JSON.parse(args[i + 1]);
      } catch {
        return { errorMessage: `Error: details must be valid JSON (got: ${args[i + 1]})` };
      }
      i += 2;
    } else {
      return { errorMessage: `Error: unknown option "${arg}"` };
    }
  }

  return parsed;
}

/**
 * Canonicalize a value to a deterministic string representation for hashing
 * This ensures consistent hash values for semantically equivalent data
 */
function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "null";

  const type = typeof value;

  if (type === "boolean" || type === "number") {
    return String(value);
  }

  if (type === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  }

  if (type === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
      .join(",")}}`;
  }

  return "null";
}

/**
 * Generate SHA-256 hash of input string
 */
function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

/**
 * Generate hash of an object for attestation
 */
function hashEntry(entry: Record<string, unknown>): string {
  return `sha256:${sha256Hex(canonicalize(entry))}`;
}

/**
 * Create an audit log entry with attestation
 */
function createAttestedEntry(options: AttestOptions): Record<string, unknown> {
  const timestamp = new Date().toISOString();

  // Build the audit log entry according to the AgentBOM v0.1 schema
  const entry: Record<string, unknown> = {
    timestamp,
    event_type: options.action,
    actor: options.actor || "unknown",
  };

  if (options.resource !== undefined) {
    entry.resource = options.resource;
  }

  if (options.outcome !== undefined) {
    entry.outcome = options.outcome;
  }

  if (options.details !== undefined) {
    entry.details = options.details;
  }

  // Add attestation hash for integrity verification
  // This hash can be used to verify that the entry hasn't been tampered with
  const entryHash = hashEntry(entry);

  return {
    ...entry,
    attestation: {
      entry_hash: entryHash,
      generator: "@wasmagent/trust-cli",
      generated_at: timestamp,
    },
  };
}

/**
 * Main command function for generating attestations
 */
export function attestCommand(args: string[]): number {
  const parsed = parseAttestArgs(args);

  if (!parsed || parsed.errorMessage) {
    console.error(parsed.errorMessage || USAGE);
    console.error(USAGE);
    return 1;
  }

  const options: AttestOptions = {
    action: parsed.action,
    actor: parsed.actor,
    resource: parsed.resource,
    outcome: parsed.outcome,
    details: parsed.details,
  };

  const entry = createAttestedEntry(options);

  // Output the attested entry as JSON
  console.log(JSON.stringify(entry, null, 2));

  return 0;
}

// Allow direct execution for testing
const isDirectRun = process.argv[1]?.endsWith("attest.ts") || process.argv[1]?.endsWith("attest.js");
if (isDirectRun) {
  const args = process.argv.slice(2);
  process.exit(attestCommand(args));
}
