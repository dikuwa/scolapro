import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { buildOfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { buildOfficialDocumentMetadata } from "@/features/documents/server/official-document-metadata";
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
const MUTED = rgb(0.38, 0.38, 0.38);

function fitText(font: PDFFont, value: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let output = value;
  while (output.length > 1 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) output = output.slice(0, -1);
  return `${output}...`;
}

export async function renderReportCardPdfWithSchoolFont(
  input: ReportCardRenderInput,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const rendered = await renderReportCardPdf(input);
  const model = buildReportCardTemplateModel(input);
  const header = buildOfficialDocumentHeaderModel(model);
  const metadata = buildOfficialDocumentMetadata({
    snapshotVersion: model.snapshotVersion,
    certifiedAt: model.certifiedAt,
    provenanceText: "Historical marks and report rules are frozen at generation.",
  });

  const pdf = await PDFDocument.load(rendered.bytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  pages.forEach((page, index) => {
    page.drawRectangle({ x: 0, y: 5, width: PAGE_WIDTH, height: 24, color: rgb(1, 1, 1) });
    page.drawText(fitText(regular, metadata.snapshotLine, 5.2, 350), {
      x: MARGIN,
      y: 19,
      size: 5.2,
      font: regular,
      color: MUTED,
    });
    const pageText = metadata.pageLabel(index + 1, pages.length);
    page.drawText(pageText, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageText, 5.2),
      y: 19,
      size: 5.2,
      font: regular,
      color: MUTED,
    });
    const certification = fitText(regular, metadata.certificationLine, 5.2, 180);
    page.drawText(certification, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(certification, 5.2),
      y: 10,
      size: 5.2,
      font: regular,
      color: MUTED,
    });
  });

  if (header.schoolNameFont === "old_english") {
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
    while (fontSize > 12 && oldEnglish.widthOfTextAtSize(header.schoolName, fontSize) > maxWidth) {
      fontSize -= 0.5;
    }
    const textWidth = oldEnglish.widthOfTextAtSize(header.schoolName, fontSize);
    page.drawText(header.schoolName, {
      x: TITLE_X + Math.max(3, (TITLE_WIDTH - textWidth) / 2),
      y: TITLE_BASELINE_Y,
      size: fontSize,
      font: oldEnglish,
      color: INK,
    });
  }

  return {
    bytes: await pdf.save(),
    pageCount: rendered.pageCount,
  };
}
