import "server-only";

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeInternalSchoolDocumentHeaderContext,
  type InternalSchoolDocumentHeaderContext,
  type OfficialDocumentHeaderModel,
} from "@/features/documents/server/official-document-header";

export function escapeOfficialDocumentHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const publicAssetCache = new Map<string, string>();
let oldEnglishFontDataUrl: string | null = null;

function logoDataUrl(bytes: Uint8Array | null | undefined): string {
  if (!bytes?.length) return "";
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const prefix = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 256))).trimStart().toLowerCase();
  const isSvg = prefix.startsWith("<svg") || prefix.startsWith("<?xml") || prefix.includes("<svg");
  const mime = isPng ? "image/png" : isJpeg ? "image/jpeg" : isSvg ? "image/svg+xml" : "";
  return mime ? `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` : "";
}

function localPublicAssetDataUrl(url: string): string {
  if (!url.startsWith("/brand/")) return "";
  const cached = publicAssetCache.get(url);
  if (cached !== undefined) return cached;
  try {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), "public", ...url.split("/").filter(Boolean))));
    const dataUrl = logoDataUrl(bytes);
    publicAssetCache.set(url, dataUrl);
    return dataUrl;
  } catch {
    publicAssetCache.set(url, "");
    return "";
  }
}

function officialOldEnglishFontFace(): string {
  if (oldEnglishFontDataUrl === null) {
    try {
      const bytes = readFileSync(join(
        process.cwd(),
        "node_modules",
        "@fontsource",
        "unifrakturcook",
        "files",
        "unifrakturcook-latin-700-normal.woff",
      ));
      oldEnglishFontDataUrl = `data:font/woff;base64,${Buffer.from(bytes).toString("base64")}`;
    } catch {
      oldEnglishFontDataUrl = "";
    }
  }
  return oldEnglishFontDataUrl
    ? `<style>@font-face{font-family:"ScolaPro Old English";src:url(${oldEnglishFontDataUrl}) format("woff");font-style:normal;font-weight:700;font-display:block}.school-name.old-english{font-family:"ScolaPro Old English","Old English Text MT","UnifrakturCook","Lucida Blackletter","Times New Roman",serif}</style>`
    : "";
}

/**
 * Shared school-name typography runtime for document renderers that own their
 * layout but still use the governed school document profile.
 */
export function renderOfficialDocumentSchoolNameFontStyle(
  header: Pick<OfficialDocumentHeaderModel, "schoolNameFont">,
): string {
  return header.schoolNameFont === "old_english" ? officialOldEnglishFontFace() : "";
}

export function officialDocumentSchoolNameClass(
  header: Pick<OfficialDocumentHeaderModel, "schoolNameFont">,
): string {
  return header.schoolNameFont === "old_english" ? "school-name old-english" : "school-name";
}

export function renderOfficialDocumentHtmlHeader(
  header: OfficialDocumentHeaderModel,
  logoBytes?: Uint8Array | null,
  options: {
    layout?: "standard" | "compact_left";
    context?: InternalSchoolDocumentHeaderContext;
  } = {},
): string {
  const resolvedLogoUrl = logoDataUrl(logoBytes) || localPublicAssetDataUrl(header.logoUrl) || header.logoUrl;
  const schoolLogoMarkup = resolvedLogoUrl
    ? `<div class="logo-wrap"><img class="school-logo" src="${escapeOfficialDocumentHtml(resolvedLogoUrl)}" alt="${escapeOfficialDocumentHtml(header.schoolName)} logo" /></div>`
    : `<div class="logo-wrap logo-placeholder"></div>`;
  const resolvedCoatOfArmsUrl = localPublicAssetDataUrl(header.governedCoatOfArms.url) || header.governedCoatOfArms.url;
  const coatOfArmsMarkup = `<div class="coat-of-arms-wrap"><img class="governed-coat-of-arms" src="${escapeOfficialDocumentHtml(resolvedCoatOfArmsUrl)}" alt="${escapeOfficialDocumentHtml(header.governedCoatOfArms.alt)}" /></div>`;
  const nameClass = officialDocumentSchoolNameClass(header);
  const contactMarkup = header.contactLines
    .map((line) => `<div><strong>${escapeOfficialDocumentHtml(line.label)}:</strong> ${escapeOfficialDocumentHtml(line.value)}</div>`)
    .join("");
  const postalMarkup = header.postalLines.map((line) => `<div>${escapeOfficialDocumentHtml(line)}</div>`).join("");
  const fontFace = renderOfficialDocumentSchoolNameFontStyle(header);

  if (header.mode === "external_correspondence") {
    return `${fontFace}<header class="school-header external-correspondence">
    ${coatOfArmsMarkup}
    <div class="school-identity">
      <h1 class="${nameClass}">${escapeOfficialDocumentHtml(header.schoolName)}</h1>
      ${header.formerName ? `<div class="former-name">(${escapeOfficialDocumentHtml(header.formerName)})</div>` : ""}
      ${contactMarkup ? `<div class="school-contact">${contactMarkup}</div>` : ""}
      ${header.schoolEmisNumber ? `<div class="emis">EMIS: ${escapeOfficialDocumentHtml(header.schoolEmisNumber)}</div>` : ""}
      ${postalMarkup ? `<div class="postal external-postal">${postalMarkup}</div>` : ""}
    </div>
    <div class="school-logo-right">${schoolLogoMarkup.replace('class="logo-wrap"', 'class="logo-wrap school-logo-wrap"')}</div>
  </header>`;
  }

  const context = options.context ? normalizeInternalSchoolDocumentHeaderContext(options.context) : null;
  const layoutClass = options.layout === "compact_left" ? " compact-left" : "";
  const contextMarkup = context
    ? `<div class="internal-document-context">
        <div class="document-context-title">${escapeOfficialDocumentHtml(context.title)}</div>
        ${context.primaryContext ? `<div>${escapeOfficialDocumentHtml(context.primaryContext)}</div>` : ""}
        ${context.secondaryContext ? `<div>${escapeOfficialDocumentHtml(context.secondaryContext)}</div>` : ""}
        ${context.summary ? `<div class="document-context-summary">${escapeOfficialDocumentHtml(context.summary)}</div>` : ""}
      </div>`
    : '<div class="internal-document-context"></div>';

  return `${fontFace}<header class="school-header internal-school${layoutClass}">
    ${schoolLogoMarkup}
    <div class="school-identity">
      <h1 class="${nameClass}">${escapeOfficialDocumentHtml(header.schoolName)}</h1>
      ${header.formerName ? `<div class="former-name">(${escapeOfficialDocumentHtml(header.formerName)})</div>` : ""}
      ${contactMarkup ? `<div class="school-contact">${contactMarkup}</div>` : ""}
    </div>
    ${contextMarkup}
  </header>`;
}
