import "server-only";

import { loadOfficialOldEnglishFontBytes } from "@/features/documents/server/official-document-fonts";

/**
 * Backward-compatible report-card alias. The runtime asset now belongs to the
 * shared official-document layer so report cards and future document families
 * cannot drift to different school-name font sources.
 */
export function loadOldEnglishFontBytes(): Promise<Uint8Array> {
  return loadOfficialOldEnglishFontBytes();
}
