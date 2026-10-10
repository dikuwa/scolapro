import "server-only";

import { randomBytes } from "node:crypto";

// Internal credential generation primitive only. Deliberately not a server action,
// API route, or export from any client component. Issuance stays disabled until
// authorization, replay protection, audit and one-time delivery are implemented.
export function generateStaffTemporaryPassword(): string {
  return randomBytes(32).toString("base64url");
}
