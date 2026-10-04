import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DOCUMENT_LOGO_FETCH_TIMEOUT_MS = 3000;
const DOCUMENT_LOGO_MAX_BYTES = 5 * 1024 * 1024;

/** Loads optional document identity art without allowing it to stall generation. */
export async function loadOfficialDocumentLogoBytes(
  storagePath: string,
  logoUrl: string,
): Promise<Uint8Array | null> {
  if (storagePath && /^https:\/\//i.test(logoUrl)) {
    try {
      const response = await fetch(logoUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(DOCUMENT_LOGO_FETCH_TIMEOUT_MS),
      });
      if (response.ok) {
        const declared = Number(response.headers.get("content-length") ?? "");
        if (!Number.isNaN(declared) && declared > DOCUMENT_LOGO_MAX_BYTES) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length && bytes.length <= DOCUMENT_LOGO_MAX_BYTES) return bytes;
      }
    } catch (error) {
      console.warn("official document remote logo unavailable; continuing with bundled or no logo", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (logoUrl.startsWith("/brand/")) {
    try {
      return new Uint8Array(await readFile(join(process.cwd(), "public", logoUrl.replace(/^\/+/, ""))));
    } catch {
      return null;
    }
  }
  return null;
}
