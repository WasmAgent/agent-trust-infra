#!/usr/bin/env bash
#
# run-chain.sh — one-command end-to-end Agent Trust Infrastructure demo.
#
# Walks the full chain on the existing bscode-agent fixtures, fully offline:
#
#   bscode workload
#         ↓ declare capabilities + emit evidence
#   CapabilityManifest + AEP
#         ↓ compose
#   AgentBOM                       (agentbom.json)
#         ↓ scan MCP surface
#   MCP Posture                    (posture.json)
#         ↓ validate evidence + map frameworks
#   audit report                   (placeholder reference)
#         ↓ summarize
#   Trust Passport                 (trust-passport.json)
#
# Asserts each step and writes chain-report.json next to this script with:
#   timestamp, repo sha, per-step duration_ms / verdict / output_hash.
#
# Usage:
#   bash examples/bscode-agent/run-chain.sh
#
# Exit status: 0 when every step is valid, 1 otherwise.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORT="${REPORT:-$SCRIPT_DIR/chain-report.json}"
CLI_ENTRY="$REPO_ROOT/cli/src/index.ts"

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is required to run the chain (https://bun.sh)." >&2
  exit 1
fi

echo "▶ agent-trust chain"
echo "  example: $SCRIPT_DIR"
echo "  report:  $REPORT"
echo

# Run the in-process chain via the CLI entrypoint. Emits one JSON object per
# step to stdout and writes chain-report.json to --out.
bun "$CLI_ENTRY" chain --example "$SCRIPT_DIR" --out "$REPORT"
CHAIN_EXIT=$?

if [ "$CHAIN_EXIT" -ne 0 ]; then
  echo "✗ chain command exited with status $CHAIN_EXIT" >&2
  exit "$CHAIN_EXIT"
fi

# Validate the produced report: overall.status == "valid" and exactly 5 step
# verdicts, all "valid". Parsing is done with bun (already required) so the
# script works fully offline without jq/python.
bun -e '
  import { readFileSync } from "node:fs";
  const report = JSON.parse(readFileSync(process.argv[1], "utf-8"));
  const ok =
    report &&
    report.overall &&
    report.overall.status === "valid" &&
    Array.isArray(report.steps) &&
    report.steps.length === 5 &&
    report.steps.every((s) => s && s.verdict === "valid" && typeof s.duration_ms === "number" && typeof s.output_hash === "string");
  if (!ok) {
    console.error("✗ chain-report.json failed validation: " + JSON.stringify(report && report.overall));
    process.exit(1);
  }
  console.log("✓ chain valid: 5/5 steps (status=" + report.overall.status + ", sha=" + report.repo_sha + ")");
' "$REPORT"
