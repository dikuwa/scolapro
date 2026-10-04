import "server-only";

/**
 * Shared physical A4 layout primitives for official school documents.
 *
 * Keep school identity semantics in official-document-header.ts. This module
 * owns page geometry, the outer official frame, header dimensions and the
 * provenance footer so report cards and future document families render the
 * same physical document chrome.
 */
export const OFFICIAL_DOCUMENT_A4_PAGE_RULE = "@page { size: A4 portrait; margin: 10mm 12mm; }";

export const OFFICIAL_DOCUMENT_BACKDROP_URL = "/brand/governed/scolapro-document-backdrop.png";
// Version browser-loaded artwork independently from the stable filesystem path used by PDF renderers.
// This prevents stale cached backdrops after the governed PNG is replaced in-place.
export const OFFICIAL_DOCUMENT_BACKDROP_CSS_URL = `${OFFICIAL_DOCUMENT_BACKDROP_URL}?v=20261005-a7e07d4b`;
export const OFFICIAL_DOCUMENT_BACKDROP_OPACITY = 0.68;

export const OFFICIAL_DOCUMENT_FRAME_RULE =
  ".report { width: 100%; border: 1.2px solid var(--line); padding: 7mm 7mm 5mm; min-height: 270mm; }";

export const OFFICIAL_DOCUMENT_HEADER_RULE =
  ".school-header { display: grid; grid-template-columns: 68px minmax(0,1fr) minmax(150px,36%); gap: 8px; align-items: center; border: 0; border-bottom: 2px solid var(--line); padding: 6px 8px 7px; min-height: 76px; }";

export const OFFICIAL_DOCUMENT_PORTRAIT_SCREEN_RULE =
  "@media screen { body { overflow-x:auto; background:#eef0f3; } .report { width:210mm; min-width:210mm; min-height:297mm; margin:0 auto; background:#fff; } }";

export const OFFICIAL_DOCUMENT_LANDSCAPE_SCREEN_RULE =
  "@media screen { body { overflow-x:auto; background:#eef0f3; } .report { width:297mm; min-width:297mm; min-height:210mm; margin:0 auto; background:#fff; } }";

export const OFFICIAL_DOCUMENT_RESPONSIVE_HEADER_RULE =
  "@media (max-width: 640px) { .school-header.internal-school { grid-template-columns: 58px minmax(0,1fr); align-items: start; } .school-header.internal-school > .logo-wrap { grid-row: 1; } .school-header.internal-school > .school-identity { grid-column: 2; } .school-header.internal-school > .internal-document-context { grid-column: 1 / -1; text-align: left; border-top: 1px solid var(--line); padding-top: 4px; } }";

export const OFFICIAL_DOCUMENT_HTML_HEADER_RULE =
  `${OFFICIAL_DOCUMENT_HEADER_RULE} ${OFFICIAL_DOCUMENT_RESPONSIVE_HEADER_RULE} ${OFFICIAL_DOCUMENT_PORTRAIT_SCREEN_RULE}
  .report { position: relative; isolation: isolate; }
  .report::before { content:""; position:absolute; inset:0; z-index:0; background:url("${OFFICIAL_DOCUMENT_BACKDROP_CSS_URL}") center / 100% 100% no-repeat; opacity:${OFFICIAL_DOCUMENT_BACKDROP_OPACITY}; pointer-events:none; user-select:none; }
  .report > * { position: relative; z-index: 1; }
  .school-header.internal-school { align-items:start; }
  .school-header.internal-school > .logo-wrap { align-self:start; padding-top:1px; }
  .school-header.internal-school > .school-identity { align-self:start; padding-top:1px; }
  .school-header.internal-school > .internal-document-context { align-self:start; padding-top:4px; }
  .school-header .logo-wrap { display:flex; align-items:flex-start; justify-content:center; min-height:66px; }
  .school-header .school-logo { display:block; max-width:62px; max-height:64px; object-fit:contain; }
  .school-header .school-identity { min-width:0; text-align:left; }
  .school-header .school-name { margin:0 0 2px; font-size:17px; line-height:1; font-weight:700; white-space:normal; }
  .school-name.old-english { font-family: "UnifrakturCook","Old English Text MT","Lucida Blackletter","Times New Roman",serif; font-weight: 700; letter-spacing: 0; }
  .school-header .former-name { margin:0 0 1px; font-size:6.2px; line-height:1.08; }
  .school-header .school-contact { font-size:6.1px; line-height:1.08; }
  .school-header .school-contact strong { font-weight:700; }
  .school-header.internal-school .internal-document-context { min-width:0; text-align:right; font-size:6.6px; line-height:1.05; }
  .school-header.internal-school .document-context-title { margin-bottom:1px; font-size:11.5px; line-height:1; font-weight:700; letter-spacing:.01em; }
  .school-header.internal-school .document-context-summary { margin-top:0; }
  .school-header.compact-left { min-height:76px; }
  .school-header.external-correspondence { grid-template-columns: 88px minmax(0,1fr) 88px; min-height:92px; padding:8px 10px; }
  .external-correspondence .coat-of-arms-wrap,
  .external-correspondence .school-logo-right,
  .external-correspondence .school-logo-wrap { display: flex; align-items: center; justify-content: center; min-height: 76px; }
  .external-correspondence .governed-coat-of-arms,
  .external-correspondence .school-logo { display: block; max-width: 68px; max-height: 68px; object-fit: contain; }
  .external-correspondence .school-identity { text-align: center; }
  .external-correspondence .school-contact { text-align: center; }
  .external-correspondence .external-postal { margin-top: 2px; padding: 0; text-align: center; line-height: 1; }
  @media (max-width: 640px) {
    .school-header.external-correspondence { grid-template-columns: 58px minmax(0,1fr) 58px; gap: 6px; padding: 6px; }
    .external-correspondence .governed-coat-of-arms,
    .external-correspondence .school-logo { max-width: 48px; max-height: 58px; }
    .external-correspondence .school-name { font-size: 17px; }
    .external-correspondence .school-contact,
    .external-correspondence .external-postal,
    .external-correspondence .emis { font-size: 6.5px; }
  }`;


export const OFFICIAL_DOCUMENT_METADATA_RULE =
  ".document-meta { display: flex; justify-content: space-between; gap: 12px; padding: 5px 2px 0; color: #666; font-size: 6px; }";

const LEGACY_OFFICIAL_DOCUMENT_PRINT_RULE = ".report { break-inside: avoid; }";

export const OFFICIAL_DOCUMENT_PRINT_RULE =
  ".report { break-inside: auto; } thead { display: table-header-group; } tr, .school-header, .document-title, .report-title, .learner-details, .remarks, .signoff-grid, .principal-symbol-grid, .class-summary, .document-meta { break-inside: avoid; page-break-inside: avoid; }";

export const OFFICIAL_DOCUMENT_PDF_GEOMETRY = Object.freeze({
  pageWidth: 595.28,
  pageHeight: 841.89,
  margin: 34,
  logoColumnWidth: 68,
  postalColumnWidth: 116,
  metadataClearanceY: 5,
  metadataClearanceHeight: 24,
  metadataPrimaryBaselineY: 19,
  metadataSecondaryBaselineY: 10,
  titleBaselineOffset: 22,
  titleClearOffset: 3,
  titleClearHeight: 23,
});

export function officialDocumentPdfContentWidth(): number {
  return OFFICIAL_DOCUMENT_PDF_GEOMETRY.pageWidth - OFFICIAL_DOCUMENT_PDF_GEOMETRY.margin * 2;
}

type ChromeReplacement = {
  name: string;
  legacy: string;
  shared: string;
};

const CHROME_REPLACEMENTS: ChromeReplacement[] = [
  { name: "A4 page rule", legacy: OFFICIAL_DOCUMENT_A4_PAGE_RULE, shared: OFFICIAL_DOCUMENT_A4_PAGE_RULE },
  { name: "official frame", legacy: OFFICIAL_DOCUMENT_FRAME_RULE, shared: OFFICIAL_DOCUMENT_FRAME_RULE },
  { name: "school header", legacy: OFFICIAL_DOCUMENT_HEADER_RULE, shared: OFFICIAL_DOCUMENT_HTML_HEADER_RULE },
  { name: "metadata footer", legacy: OFFICIAL_DOCUMENT_METADATA_RULE, shared: OFFICIAL_DOCUMENT_METADATA_RULE },
];

export function applyOfficialDocumentHtmlChrome(html: string): string {
  let output = html;

  for (const replacement of CHROME_REPLACEMENTS) {
    if (!output.includes(replacement.legacy)) {
      throw new Error(`Official document renderer did not expose the expected ${replacement.name}.`);
    }
    output = output.replace(replacement.legacy, replacement.shared);
  }

  const legacyPrintBlock = `@media print {\n    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }\n    ${LEGACY_OFFICIAL_DOCUMENT_PRINT_RULE}\n  }`;
  if (!output.includes(legacyPrintBlock)) {
    throw new Error("Official document renderer did not expose the expected print chrome.");
  }

  const sharedPrintBlock = `@media print {\n    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }\n    ${OFFICIAL_DOCUMENT_PRINT_RULE}\n  }`;
  return output.replace(legacyPrintBlock, sharedPrintBlock);
}
