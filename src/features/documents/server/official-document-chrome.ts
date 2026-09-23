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

export const OFFICIAL_DOCUMENT_FRAME_RULE =
  ".report { width: 100%; border: 1.2px solid var(--line); padding: 7mm 7mm 5mm; min-height: 270mm; }";

export const OFFICIAL_DOCUMENT_HEADER_RULE =
  ".school-header { display: grid; grid-template-columns: 88px minmax(0,1fr) 128px; gap: 10px; align-items: center; border: 1px solid var(--line); padding: 8px 10px; min-height: 92px; }";

/**
 * Keep the official header readable when an HTML print view is inspected on
 * a phone-sized viewport. The fixed postal column otherwise overlaps the
 * school's contact block once the identity column becomes too narrow.
 */
export const OFFICIAL_DOCUMENT_RESPONSIVE_HEADER_RULE =
  "@media (max-width: 640px) { .school-header { grid-template-columns: 76px minmax(0,1fr); align-items: start; } .school-header > .logo-wrap { grid-row: 1 / span 2; } .school-header > .school-identity, .school-header > .postal { grid-column: 2; } .school-header > .postal { align-self: start; padding-bottom: 0; } }";

export const OFFICIAL_DOCUMENT_HTML_HEADER_RULE =
  `${OFFICIAL_DOCUMENT_HEADER_RULE} ${OFFICIAL_DOCUMENT_RESPONSIVE_HEADER_RULE}
  .school-header.external-correspondence { grid-template-columns: 88px minmax(0,1fr) 88px; }
  .external-correspondence .coat-of-arms-wrap,
  .external-correspondence .school-logo-right,
  .external-correspondence .school-logo-wrap { display: flex; align-items: center; justify-content: center; min-height: 76px; }
  .external-correspondence .governed-coat-of-arms,
  .external-correspondence .school-logo { display: block; max-width: 68px; max-height: 68px; object-fit: contain; }
  .external-correspondence .school-identity { text-align: center; }
  .external-correspondence .school-contact { text-align: center; }
  .external-correspondence .external-postal { margin-top: 4px; padding: 0; text-align: center; }
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
  logoColumnWidth: 82,
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

/**
 * Verifies that a renderer exposes the shared chrome integration points.
 * Renderer-owned legacy CSS is upgraded here so renderer revision/versioning
 * semantics remain untouched while shared document print behavior can evolve.
 */
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
