import "server-only";

import { Buffer } from "node:buffer";
import { applyOfficialDocumentHtmlChrome } from "@/features/documents/server/official-document-chrome";
import {
  escapeOfficialDocumentHtml,
  renderOfficialDocumentHtmlHeader,
} from "@/features/documents/server/official-document-html-header";
import { buildOfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { buildOfficialDocumentMetadata } from "@/features/documents/server/official-document-metadata";
import { loadOldEnglishFontBytes } from "@/features/reporting/server/report-card-fonts";
import { renderReportCardHtml } from "@/features/reporting/server/render-report-card-html";
import {
  buildReportCardTemplateModel,
  type ReportCardRenderInput,
} from "@/features/reporting/server/report-card-template-model";

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

  const sharedHeader = renderOfficialDocumentHtmlHeader(header, input.logoBytes);
  const withSharedHeader = html.replace(/<header class="school-header">[\s\S]*?<\/header>/, sharedHeader);
  if (withSharedHeader === html) {
    throw new Error("Report-card HTML renderer did not expose the expected school header block.");
  }
  html = withSharedHeader;

  const metadata = buildOfficialDocumentMetadata({
    snapshotVersion: model.snapshotVersion,
    certifiedAt: model.certifiedAt,
    provenanceText: "Historical marks and report rules are frozen at generation.",
  });
  const footer = `<footer class="document-meta">
    <span>${escapeOfficialDocumentHtml(metadata.snapshotLine)}</span>
    <span>${escapeOfficialDocumentHtml(metadata.certificationLine)}</span>
  </footer>`;
  const withSharedFooter = html.replace(/<footer class="document-meta">[\s\S]*?<\/footer>/, footer);
  if (withSharedFooter === html) {
    throw new Error("Report-card HTML renderer did not expose the expected document metadata footer.");
  }
  return withSharedFooter;
}
