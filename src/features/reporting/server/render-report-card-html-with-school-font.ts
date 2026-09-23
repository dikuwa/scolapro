import "server-only";

import { Buffer } from "node:buffer";
import { applyOfficialDocumentHtmlChrome } from "@/features/documents/server/official-document-chrome";
import { renderOfficialDocumentHtmlFooter } from "@/features/documents/server/official-document-html-footer";
import { renderOfficialDocumentHtmlHeader } from "@/features/documents/server/official-document-html-header";
import {
  buildOfficialDocumentHeaderModel,
  officialDocumentHeaderModeForType,
} from "@/features/documents/server/official-document-header";
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
  const header = buildOfficialDocumentHeaderModel(model, {
    mode: officialDocumentHeaderModeForType("report_card"),
    provenanceSource: "frozen_snapshot",
  });

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
  const schoolHeaderPattern = /<header class="school-header">[\s\S]*?<\/header>/;
  if (!schoolHeaderPattern.test(html)) {
    throw new Error("Report-card HTML renderer did not expose the expected school header block.");
  }
  html = html.replace(schoolHeaderPattern, sharedHeader);

  const metadata = buildOfficialDocumentMetadata({
    snapshotVersion: model.snapshotVersion,
    certifiedAt: model.certifiedAt,
    provenanceText: `${model.generatedAt ? `Generated ${model.generatedAt} · ` : ""}Historical marks and report rules are frozen at generation.`,
  });
  const footer = renderOfficialDocumentHtmlFooter({
    left: metadata.snapshotLine,
    right: metadata.certificationLine,
  });
  const documentMetaPattern = /<footer class="document-meta">[\s\S]*?<\/footer>/;
  if (!documentMetaPattern.test(html)) {
    throw new Error("Report-card HTML renderer did not expose the expected document metadata footer.");
  }
  return html.replace(documentMetaPattern, footer);
}
