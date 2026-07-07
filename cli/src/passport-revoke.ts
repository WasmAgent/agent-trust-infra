/**
 * passport revoke — Mark a Trust Passport JSON as revoked.
 *
 * Reads a Trust Passport JSON, sets `revocation.revoked = true` together with a
 * `revoked_at` timestamp (and an optional `revocation_reason`), then writes the
 * updated passport back to the source path (or to `--out`). The revoked
 * passport can then be re-signed; `passport verify-signed` rejects revoked
 * passports even when the signature is otherwise valid.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { revokePassport } from "../../packages/trust-passport-core/src/index.js";

export interface RevokeFileOptions {
  passportPath: string;
  reason?: string;
  outPath?: string;
}

/**
 * Revoke a Trust Passport JSON file in place (or to `outPath`).
 * Returns the resolved output path.
 */
export function revokePassportFile(options: RevokeFileOptions): string {
  const { passportPath, reason, outPath } = options;
  const raw = readFileSync(resolve(passportPath), "utf-8");
  const passport = JSON.parse(raw) as Record<string, unknown>;
  const revoked = revokePassport(passport, reason ? { reason } : {});
  const dest = outPath ? resolve(outPath) : resolve(passportPath);
  writeFileSync(dest, `${JSON.stringify(revoked, null, 2)}\n`, "utf-8");
  return dest;
}

/** CLI entry point for `passport revoke`. */
export function revokePassportCommand(args: string[]): number {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(
      [
        "Usage: agent-trust passport revoke <passport.json> [--reason <text>] [--out <path>]",
        "",
        "Marks a Trust Passport JSON as revoked (revocation.revoked = true).",
        "",
        "Options:",
        "  --reason <text>   Human-readable revocation reason (revocation_reason)",
        "  --out <path>      Write the revoked passport here (default: overwrite source)",
        "",
        "Output: writes the revoked passport JSON and prints the output path.",
      ].join("\n"),
    );
    return 0;
  }

  let passportPath = "";
  let reason: string | undefined;
  let outPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--reason" && next) {
      reason = next;
      i++;
    } else if (arg === "--out" && next) {
      outPath = next;
      i++;
    } else if (!arg.startsWith("--") && !passportPath) {
      passportPath = arg;
    } else if (!arg.startsWith("--")) {
      console.error(`Error: unexpected argument "${arg}"`);
      return 1;
    }
  }

  if (!passportPath) {
    console.error("Error: passport revoke requires a <passport.json> argument");
    return 1;
  }

  try {
    const dest = revokePassportFile({ passportPath, reason, outPath });
    console.log(dest);
    return 0;
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
