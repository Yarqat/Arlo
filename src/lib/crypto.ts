import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, scryptSync } from "node:crypto";
import { env } from "./env";

// AES-256-GCM encryption for integration secrets at rest.
// The key lives in APP_ENCRYPTION_KEY (env, outside the database).

function key(): Buffer {
  return Buffer.from(env().APP_ENCRYPTION_KEY, "hex");
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: v1.<iv>.<tag>.<ciphertext>  (all base64url)
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptJson<T = unknown>(blob: string | null | undefined): T | null {
  if (!blob) return null;
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Malformed ciphertext");
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const enc = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}

// Password hashing with scrypt (no native dependency).
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  const derived = scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

// Mask a secret for display: keep last 4 chars.
export function maskSecret(s: string | null | undefined): string {
  if (!s) return "";
  if (s.length <= 4) return "••••";
  return "••••••" + s.slice(-4);
}
