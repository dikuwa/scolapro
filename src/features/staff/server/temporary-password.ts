import "server-only";

import { randomBytes } from "node:crypto";

// Cryptographically secure 256-bit secret. Never store or log the plaintext.
// This is an internal primitive; issuance remains disabled until governance,
// rate limits, audit, atomicity, and one-time delivery are implemented.
export function generateStaffTemporaryPassword(): string {
  return randomBytes(32).toString("base64url");
}

// Represent only a non-reversible fingerprint when identifying an issuance
// attempt. HMAC binds the value to a server-held secret, protecting against
// offline guesses if a database audit record is exposed.
export async function fingerprintStaffTemporaryPassword(
  password: string,
  secret: string,
): Promise<string> {
  const { createHmac } = await import("node:crypto");
  if (secret.length < 32) throw new Error("Credential audit secret is not configured securely.");
  return createHmac("sha256", secret).update(password).digest("hex");
}
