import crypto from "node:crypto";

/**
 * Secret handling for values FormHub must be able to *replay* (agency SMTP
 * passwords, Turnstile secrets, webhook signing keys) versus values it only
 * needs to *verify* (invite tokens, cron secret).
 *
 * Replay  -> encryptSecret / decryptSecret  (AES-256-GCM, reversible)
 * Verify  -> hashToken / safeEqual          (SHA-256, one-way)
 */

const ALGO = "aes-256-gcm";
/** Ciphertexts are versioned so ENCRYPTION_KEY can be rotated later. */
const KEY_VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

/** Returns "v1.<iv>.<authTag>.<ciphertext>", all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    KEY_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4) throw new Error("Malformed ciphertext");
  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== KEY_VERSION) {
    throw new Error(`Unsupported ciphertext version: ${version}`);
  }
  const decipher = crypto.createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** A URL-safe random token. Only its hash is ever persisted. */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time string comparison. Hashes both sides first so that unequal
 * lengths don't throw and don't leak length through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Public key for a form's ingest URL: POST /f/{publicKey}.
 * base64url over 18 bytes -> 24 unpadded chars.
 */
export function generatePublicKey(): string {
  return crypto.randomBytes(18).toString("base64url");
}

export function hmacSha256Hex(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}
