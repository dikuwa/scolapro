import "server-only";

import { Buffer } from "node:buffer";
import { applyOfficialDocumentHtmlChrome } from "@/features/documents/server/official-document-chrome";
import { buildOfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { buildOfficialDocumentMetadata } from "@/features/documents/server/official-document-metadata";
import { loadOldEnglishFontBytes } from "@/features/reporting/server/report-card-fonts";
import { renderReportCardHtml } from "@/features/reporting/server/render-report-card-html";
import {
  buildReportCardTemplateModel,
  type ReportCardRenderInput,
} from "@/features/reporting/server/report-card-template-model";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function renderReportCardHtmlWithSchoolFont(
  input: ReportCardRenderInput,
): Promise<string> {
  let html = applyOfficialDocumentHtmlChrome(renderReportCardHtml(input));
  const model = buildReportCardTemplateModel(input);
  const header = buildOfficialDocumentHeaderModel(model);

  if (header.schoolNameFont === "old_english") {
    const fontBase64 = Buffer.from(await loadOldEnglishFontBytes()).toString("base64");
    const fontFace = `@font-face { font-family: "ScolaPro Old English"; src: url(data:font/woff;base64,${fontBase64}) format("woff"); font-style: normal; font-weight: 700; font-display: block; }`;

    html = html
      .replace("<style>", `<style>\n  ${fontFace}`)
      .replace(
        'font-family: "Old English Text MT", "UnifrakturCook", "Lucida Blackletter", "Times New Roman", serif;',
        'font-family: "ScolaPro Old English", "Old English Text MT", "UnifrakturCook", "Lucida Blackletter", "Times New Roman", serif;',
      );
  }

  const contactMarkup = header.contactLines
    .map((line) => `<div><span>${escapeHtml(line.label)}:</span> ${escapeHtml(line.value)}</div>`)
    .join("");
  const sharedContactBlock = contactMarkup ? `<div class="school-contact">${contactMarkup}</div>` : "";
  html = html.replace(
    /<div class="school-contact">(?:<div>[\s\S]*?<\/div>)*<\/div>/,
    sharedContactBlock,
  );

  const postalMarkup = header.postalLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  const withSharedPostal = html.replace(
    /<div class="postal">(?:<div>[\s\S]*?<\/div>)*<\/div>/,
    `<div class="postal">${postalMarkup}</div>`,
  );
  if (withSharedPostal === html && postalMarkup) {
    throw new Error("Report-card HTML renderer did not expose the expected school postal header block.");
  }
  html = withSharedPostal;

  const metadata = buildOfficialDocumentMetadata({
    snapshotVersion: model.snapshotVersion,
    certifiedAt: model.certifiedAt,
    provenanceText: "Historical marks and report rules are frozen at generation.",
  });
  const footer = `<footer class="document-meta">
    <span>${escapeHtml(metadata.snapshotLine)}</span>
    <span>${escapeHtml(metadata.certificationLine)}</span>
  </footer>`;
  const withSharedFooter = html.replace(/<footer class="document-meta">[\s\S]*?<\/footer>/, footer);
  if (withSharedFooter === html) {
    throw new Error("Report-card HTML renderer did not expose the expected document metadata footer.");
  }
  return withSharedFooter;
}
