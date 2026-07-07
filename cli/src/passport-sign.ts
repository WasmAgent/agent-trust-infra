/**
 * passport sign — Sign a Trust Passport JSON as a JWT using Ed25519 (EdDSA).
 *
 * Reads a Trust Passport JSON, signs the payload with an Ed25519 private key,
 * and outputs the signed JWT to stdout.
 */
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Base64url encode a Buffer or string. */
function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64url");
}

/** Read an Ed25519 private key from PEM or raw hex format. */
export function readPrivateKey(keyPath: string): ReturnType<typeof createPrivateKey> {
  const raw = readFileSync(keyPath, "utf-8").trim();

  if (raw.startsWith("-----BEGIN")) {
    // PEM format
    return createPrivateKey(raw);
  }

  // Raw hex format: 64 hex chars = 32 bytes seed
  const hexClean = raw.replace(/\s+/g, "");
  if (/^[0-9a-fA-F]{64}$/.test(hexClean)) {
    const seed = Buffer.from(hexClean, "hex");
    // Wrap raw seed in PKCS#8 DER for Ed25519
    // Ed25519 PKCS#8 prefix: 302e020100300506032b6570042204 20
    const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
    const der = Buffer.concat([pkcs8Prefix, seed]);
    return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  }

  throw new Error(
    `Unsupported key format in "${keyPath}". Expected PEM (-----BEGIN PRIVATE KEY-----) or 64-char hex seed.`,
  );
}

/** Parse a duration string like "1y", "90d", "6m" into milliseconds. */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)\s*(y|m|d|h)$/i);
  if (!match) throw new Error(`Invalid duration format: "${duration}". Use e.g. 1y, 90d, 6m, 24h`);
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "y":
      return value * 365 * 24 * 60 * 60 * 1000;
    case "m":
      return value * 30 * 24 * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

export interface SignOptions {
  artifactPath: string;
  keyPath: string;
  expires?: string; // duration like "1y", "90d"
}

/**
 * Sign a Trust Passport JSON and return the JWT string.
 */
export function signPassport(options: SignOptions): string {
  const { artifactPath, keyPath, expires } = options;

  // Read and parse the passport
  const passportRaw = readFileSync(resolve(artifactPath), "utf-8");
  const passport = JSON.parse(passportRaw) as Record<string, unknown>;

  // Ensure validity.expires_at is set
  const validity = (passport.validity ?? {}) as Record<string, unknown>;
  if (!validity.expires_at) {
    const expiryMs = expires ? parseDuration(expires) : 365 * 24 * 60 * 60 * 1000; // default 1 year
    validity.expires_at = new Date(Date.now() + expiryMs).toISOString();
    passport.validity = validity;
  }

  // Read the private key
  const privateKey = readPrivateKey(resolve(keyPath));

  // Build JWT header
  const header = {
    alg: "EdDSA",
    typ: "JWT",
  };

  // Build JWT payload
  const now = Math.floor(Date.now() / 1000);
  const expiresAtStr = (passport.validity as Record<string, unknown>)?.expires_at as string;
  const exp = expiresAtStr ? Math.floor(new Date(expiresAtStr).getTime() / 1000) : now + 365 * 24 * 60 * 60;

  const payload = {
    ...passport,
    iat: now,
    exp,
  };

  // Encode and sign
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = sign(null, Buffer.from(signingInput, "utf-8"), privateKey);
  const signatureB64 = base64url(signature);

  return `${signingInput}.${signatureB64}`;
}

/** CLI entry point for `passport sign`. */
export function signPassportCommand(args: string[]): number {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(
      [
        "Usage: agent-trust passport sign <artifact.json> --key <key-path> [--expires <duration>]",
        "",
        "Signs a Trust Passport JSON as a JWT using Ed25519 (EdDSA).",
        "",
        "Options:",
        "  --key <path>       Path to Ed25519 private key (PEM or 64-char hex seed)",
        "  --expires <dur>    Expiry duration if not set in passport (default: 1y)",
        "                     Formats: 1y, 90d, 6m, 24h",
        "",
        "Output: signed JWT printed to stdout.",
      ].join("\n"),
    );
    return 0;
  }

  let artifactPath = "";
  let keyPath = "";
  let expires: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--key" && next) {
      keyPath = next;
      i++;
    } else if (arg === "--expires" && next) {
      expires = next;
      i++;
    } else if (!arg.startsWith("--") && !artifactPath) {
      artifactPath = arg;
    } else if (!arg.startsWith("--")) {
      console.error(`Error: unexpected argument "${arg}"`);
      return 1;
    }
  }

  if (!artifactPath) {
    console.error("Error: passport sign requires an <artifact.json> argument");
    return 1;
  }
  if (!keyPath) {
    console.error("Error: passport sign requires --key <key-path>");
    return 1;
  }

  try {
    const jwt = signPassport({ artifactPath, keyPath, expires });
    console.log(jwt);
    return 0;
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
