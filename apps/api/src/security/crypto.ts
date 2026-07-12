import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyFromSecret(secret: string): Buffer {
  const asBase64 = Buffer.from(secret, "base64");
  if (asBase64.length === 32) return asBase64;
  const raw = Buffer.from(secret);
  if (raw.length === 32) return raw;
  throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
}

export function encryptJson(value: unknown, secret: string): string {
  const key = keyFromSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptJson<T>(payload: string, secret: string): T {
  const key = keyFromSecret(secret);
  const raw = Buffer.from(payload, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
