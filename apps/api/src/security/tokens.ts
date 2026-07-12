import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function signState(nonce: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(nonce).digest("base64url");
  return `${nonce}.${signature}`;
}

export function verifySignedState(state: string, secret: string): string | null {
  const [nonce, signature] = state.split(".");
  if (!nonce || !signature) return null;
  const expected = createHmac("sha256", secret).update(nonce).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? nonce : null;
}
