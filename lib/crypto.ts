import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Sealed boxes for secrets at rest (OAuth refresh tokens). AES-256-GCM with a
 * random 12-byte nonce; the version prefix allows a future key rotation.
 * The key is 32 random bytes, base64-encoded, from INTEGRATIONS_ENCRYPTION_KEY.
 */

export const SEALED_BOX_VERSION = "v1";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

/** True when the string decodes to exactly 32 bytes of base64. Used by env validation. */
export function isValidKey(keyBase64: string): boolean {
  try {
    return decodeKey(keyBase64).length === KEY_BYTES;
  } catch {
    return false;
  }
}

function decodeKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64.trim(), "base64");
  if (key.length !== KEY_BYTES) throw new CryptoError("Encryption key must be 32 bytes, base64-encoded.");
  return key;
}

export function sealBox(plaintext: string, keyBase64: string): string {
  const key = decodeKey(keyBase64);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SEALED_BOX_VERSION, nonce.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function openBox(sealed: string, keyBase64: string): string {
  const key = decodeKey(keyBase64);
  const parts = sealed.split(".");
  if (parts.length !== 4 || !timingSafeEqual(Buffer.from(parts[0]), Buffer.from(SEALED_BOX_VERSION))) {
    throw new CryptoError("Unrecognized sealed box format.");
  }
  const nonce = Buffer.from(parts[1], "base64url");
  const ciphertext = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  if (nonce.length !== NONCE_BYTES || tag.length !== 16) throw new CryptoError("Unrecognized sealed box format.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new CryptoError("Sealed box failed authentication.");
  }
}
