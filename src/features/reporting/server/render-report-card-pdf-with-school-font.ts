import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { loadOldEnglishFontBytes } from "@/features/reporting/server/report-card-fonts";
import { renderReportCardPdf } from "@/features/reporting/server/render-report-card-pdf";
import {
  buildReportCardTemplateModel,
  type ReportCardRenderInput,
} from "@/features/reporting/server/report-card-template-model";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 34;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LOGO_WIDTH = 82;
const POSTAL_WIDTH = 116;
const TITLE_X = MARGIN + LOGO_WIDTH;
const TITLE_WIDTH = CONTENT_WIDTH - LOGO_WIDTH - POSTAL_WIDTH;
const TITLE_BASELINE_Y = PAGE_HEIGHT - MARGIN - 22;
const TITLE_CLEAR_Y = TITLE_BASELINE_Y - 3;
const TITLE_CLEAR_HEIGHT = 23;
const INK = rgb(0.08, 0.08, 0.08);

export async function renderReportCardPdfWithSchoolFont(
  input: ReportCardRenderInput,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const rendered = await renderReportCardPdf(input);
  const model = buildReportCardTemplateModel(input);
  if (model.schoolNameFont !== "old_english") return rendered;

  const pdf = await PDFDocument.load(rendered.bytes);
  pdf.registerFontkit(fontkit);
  const oldEnglish = await pdf.embedFont(await loadOldEnglishFontBytes(), { subset: true });
  const page = pdf.getPage(0);

  page.drawRectangle({
    x: TITLE_X,
    y: TITLE_CLEAR_Y,
    width: TITLE_WIDTH,
    height: TITLE_CLEAR_HEIGHT,
    color: rgb(1, 1, 1),
  });

  let fontSize = 19;
  const maxWidth = TITLE_WIDTH - 6;
  while (fontSize > 12 && oldEnglish.widthOfTextAtSize(model.schoolName, fontSize) > maxWidth) {
    fontSize -= 0.5;
  }
  const textWidth = oldEnglish.widthOfTextAtSize(model.schoolName, fontSize);
  page.drawText(model.schoolName, {
    x: TITLE_X + Math.max(3, (TITLE_WIDTH - textWidth) / 2),
    y: TITLE_BASELINE_Y,
    size: fontSize,
    font: oldEnglish,
    color: INK,
  });

  return {
    bytes: await pdf.save(),
    pageCount: rendered.pageCount,
  };
}
