import "server-only";

import { Buffer } from "node:buffer";
import { loadOldEnglishFontBytes } from "@/features/reporting/server/report-card-fonts";
import { renderReportCardHtml } from "@/features/reporting/server/render-report-card-html";
import {
  buildReportCardTemplateModel,
  type ReportCardRenderInput,
} from "@/features/reporting/server/report-card-template-model";

export async function renderReportCardHtmlWithSchoolFont(
  input: ReportCardRenderInput,
): Promise<string> {
  const html = renderReportCardHtml(input);
  const model = buildReportCardTemplateModel(input);
  if (model.schoolNameFont !== "old_english") return html;

  const fontBase64 = Buffer.from(await loadOldEnglishFontBytes()).toString("base64");
  const fontFace = `@font-face { font-family: "ScolaPro Old English"; src: url(data:font/woff;base64,${fontBase64}) format("woff"); font-style: normal; font-weight: 700; font-display: block; }`;

  return html
    .replace("<style>", `<style>\n  ${fontFace}`)
    .replace(
      'font-family: "Old English Text MT", "UnifrakturCook", "Lucida Blackletter", "Times New Roman", serif;',
      'font-family: "ScolaPro Old English", "Old English Text MT", "UnifrakturCook", "Lucida Blackletter", "Times New Roman", serif;',
    );
}
