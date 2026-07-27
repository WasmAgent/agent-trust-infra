#!/usr/bin/env node
/**
 * Schema drift gate (WasmAgent/agent-trust-infra#355).
 *
 * Mirrors symkernel's `make sync-schemas`: fails CI when a locally vendored
 * `specs/<contract>/schema.json` diverges from the canonical schema published by
 * `@wasmagent/protocol`.
 *
 * `agent-trust-infra` is the domain steward for the `agentbom` and `mcp-posture`
 * schemas; their canonical JSON lives in `wasmagent-protocol` and is consumed via the
 * `@wasmagent/protocol` package. Until the package publishes a given schema, the local
 * vendored copy remains authoritative and this gate reports
 * "PENDING UPSTREAM PUBLICATION" for it (exit 0). The moment the package publishes the
 * schema, this gate enforces semantic parity with the vendored copy, so a stale fork
 * can never silently ship.
 *
 * The `$id`/`$schema` keywords are excluded from the comparison: they legitimately
 * differ during the namespace migration (local `github.com/...` → canonical
 * `wasmagent.dev/...`) and are reconciled by the upstream contract-change process, not
 * by this gate.
 *
 * Usage:  node scripts/sync-schemas.mjs      (run by `bun run sync-schemas` / CI)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const moduleRequire = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Schemas this repo stewards and must keep in sync with @wasmagent/protocol. */
const CONTRACTS = [
  {
    name: 'agentbom',
    localPath: 'specs/agentbom/schema.json',
    protocolId: 'agentbom',
    expectedVersion: 'agentbom/v0.1',
  },
  {
    name: 'mcp-posture',
    localPath: 'specs/mcp-posture/schema.json',
    protocolId: 'mcp-posture',
    expectedVersion: 'mcp-posture/v0.1',
  },
];

/** Read & parse @wasmagent/protocol's schema index, or null if the package is absent. */
function loadProtocolIndex() {
  try {
    const indexPath = moduleRequire.resolve('@wasmagent/protocol/schemas/index.json');
    return JSON.parse(readFileSync(indexPath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Look up a registered schema's parsed JSON by id, or undefined if not registered. */
function readCanonicalSchema(index, id) {
  const entry = (index?.schemas ?? []).find((s) => s.id === id);
  if (!entry?.path) return undefined;
  try {
    const indexPath = moduleRequire.resolve('@wasmagent/protocol/schemas/index.json');
    // entry.path is relative to the package root (parent of schemas/).
    const schemaPath = resolve(dirname(indexPath), '..', entry.path);
    return JSON.parse(readFileSync(schemaPath, 'utf-8'));
  } catch {
    return undefined;
  }
}

/** Deep stable stringify: recursively sort object keys so comparison ignores key order. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeys(value[k]);
        return acc;
      }, {});
  }
  return value;
}

/** Normalize a schema for comparison: drop namespace/version meta, sort keys, stringify. */
export function fingerprint(schema) {
  const { $id, $schema, ...body } = schema;
  return JSON.stringify(sortKeys(body));
}

/**
 * Classify one contract against its canonical schema.
 *
 * @returns {'OK'|'DRIFT'|'PENDING'} OK = in sync, DRIFT = bodies differ, PENDING = upstream
 *   has not published the schema yet (local vendored copy stays authoritative).
 */
export function evaluateContract(contract, canonical) {
  if (!canonical) return 'PENDING';
  const local = JSON.parse(readFileSync(resolve(repoRoot, contract.localPath), 'utf-8'));
  return fingerprint(local) === fingerprint(canonical) ? 'OK' : 'DRIFT';
}

/**
 * Run the drift gate.
 *
 * @returns {{ exitCode: number, lines: string[] }} summary lines and process exit code.
 */
export function runSyncSchemasGate() {
  const lines = [];
  const index = loadProtocolIndex();
  if (!index) {
    lines.push(
      'WARNING: @wasmagent/protocol is not installed; cannot compare against the canonical source.',
    );
  }
  let drift = false;

  for (const contract of CONTRACTS) {
    const canonical = index ? readCanonicalSchema(index, contract.protocolId) : undefined;
    const status = evaluateContract(contract, canonical);

    if (status === 'PENDING') {
      // Upstream has not published this schema yet: local copy stays authoritative.
      lines.push(
        `PENDING  ${contract.name}: @wasmagent/protocol has not registered schema id ` +
          `"${contract.protocolId}" (expected ${contract.expectedVersion}); ` +
          `local vendored ${contract.localPath} remains authoritative. ` +
          `Track upstream publication in wasmagent-protocol.`,
      );
      continue;
    }

    if (status === 'OK') {
      lines.push(`OK       ${contract.name}: in sync with @wasmagent/protocol (${contract.protocolId}).`);
      continue;
    }

    drift = true;
    lines.push(
      `DRIFT    ${contract.name}: local ${contract.localPath} differs from canonical ` +
        `@wasmagent/protocol schema "${contract.protocolId}". ` +
        `Reconcile via the contract-change process (upstream genuine improvements into ` +
        `wasmagent-protocol, drop the rest), then re-sync.`,
    );
  }

  lines.push(drift ? 'FAIL: schema drift detected.' : 'PASS: no schema drift.');
  return { exitCode: drift ? 1 : 0, lines };
}

// CLI entry point — skipped when imported as a module.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, lines } = runSyncSchemasGate();
  for (const line of lines) console.log(line);
  process.exit(exitCode);
}
