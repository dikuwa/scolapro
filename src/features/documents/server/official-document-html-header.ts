import "server-only";

import { Buffer } from "node:buffer";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";

export function escapeOfficialDocumentHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function logoDataUrl(bytes: Uint8Array | null | undefined): string {
  if (!bytes?.length) return "";
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const mime = isPng ? "image/png" : isJpeg ? "image/jpeg" : "";
  return mime ? `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` : "";
}

/**
 * Canonical school-identity markup for official HTML documents.
 *
 * Document families own their title/body/footer, while the school logo,
 * identity, contact order, EMIS line, and postal block are rendered from the
 * shared official header model in one place.
 */
export function renderOfficialDocumentHtmlHeader(
  header: OfficialDocumentHeaderModel,
  logoBytes?: Uint8Array | null,
): string {
  const resolvedLogoUrl = logoDataUrl(logoBytes) || header.logoUrl;
  const logoMarkup = resolvedLogoUrl
    ? `<div class="logo-wrap"><img class="school-logo" src="${escapeOfficialDocumentHtml(resolvedLogoUrl)}" alt="${escapeOfficialDocumentHtml(header.schoolName)} logo" /></div>`
    : `<div class="logo-wrap logo-placeholder"></div>`;
  const nameClass = header.schoolNameFont === "old_english" ? " old-english" : "";
  const contactMarkup = header.contactLines
    .map((line) => `<div><span>${escapeOfficialDocumentHtml(line.label)}:</span> ${escapeOfficialDocumentHtml(line.value)}</div>`)
    .join("");
  const postalMarkup = header.postalLines
    .map((line) => `<div>${escapeOfficialDocumentHtml(line)}</div>`)
    .join("");

  return `<header class="school-header">
    ${logoMarkup}
    <div class="school-identity">
      <h1 class="school-name${nameClass}">${escapeOfficialDocumentHtml(header.schoolName)}</h1>
      ${header.formerName ? `<div class="former-name">(${escapeOfficialDocumentHtml(header.formerName)})</div>` : ""}
      ${contactMarkup ? `<div class="school-contact">${contactMarkup}</div>` : ""}
      ${header.schoolEmisNumber ? `<div class="emis">EMIS: ${escapeOfficialDocumentHtml(header.schoolEmisNumber)}</div>` : ""}
    </div>
    <div class="postal">${postalMarkup}</div>
  </header>`;
}
