import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CryptoError, isValidKey, openBox, sealBox } from "@/lib/crypto";

const KEY = randomBytes(32).toString("base64");
const OTHER = randomBytes(32).toString("base64");

describe("sealed boxes", () => {
  it("round-trips and never stores the plaintext", () => {
    const sealed = sealBox("1//refresh-token-value", KEY);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("refresh-token");
    expect(openBox(sealed, KEY)).toBe("1//refresh-token-value");
  });

  it("uses a fresh nonce every time", () => {
    expect(sealBox("same", KEY)).not.toBe(sealBox("same", KEY));
  });

  it("rejects the wrong key, tampering, and malformed input", () => {
    const sealed = sealBox("secret", KEY);
    expect(() => openBox(sealed, OTHER)).toThrow(CryptoError);
    const parts = sealed.split(".");
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith("AA") ? "BB" : "AA");
    expect(() => openBox(parts.join("."), KEY)).toThrow(CryptoError);
    expect(() => openBox("v0.a.b.c", KEY)).toThrow(CryptoError);
    expect(() => openBox("garbage", KEY)).toThrow(CryptoError);
  });

  it("validates key length", () => {
    expect(isValidKey(KEY)).toBe(true);
    expect(isValidKey(randomBytes(16).toString("base64"))).toBe(false);
    expect(isValidKey("not base64 at all!!")).toBe(false);
    expect(() => sealBox("x", "short")).toThrow(CryptoError);
  });
});
