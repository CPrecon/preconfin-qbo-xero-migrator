import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPkcePair, signState, verifySignedState } from "./tokens.js";

describe("token utilities", () => {
  it("creates a valid S256 PKCE pair", () => {
    const pair = createPkcePair();
    const expected = createHash("sha256")
      .update(pair.codeVerifier)
      .digest("base64url");
    expect(pair.codeVerifier.length).toBeGreaterThan(40);
    expect(pair.codeChallenge).toBe(expected);
  });

  it("rejects tampered OAuth state", () => {
    const state = signState("nonce", "12345678901234567890123456789012");
    expect(verifySignedState(state, "12345678901234567890123456789012")).toBe(
      "nonce",
    );
    expect(
      verifySignedState(`${state}x`, "12345678901234567890123456789012"),
    ).toBeNull();
  });
});
