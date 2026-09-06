import "server-only";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import {
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  officialDocumentPdfContentWidth,
} from "@/features/documents/server/official-document-chrome";
import { buildOfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { buildOfficialDocumentMetadata } from "@/features/documents/server/official-document-metadata";
import { loadOldEnglishFontBytes } from "@/features/reporting/server/report-card-fonts";
import { renderReportCardPdf } from "@/features/reporting/server/render-report-card-pdf";
import {
  buildReportCardTemplateModel,
  type ReportCardRenderInput,
} from "@/features/reporting/server/report-card-template-model";

const {
  pageWidth: PAGE_WIDTH,
  pageHeight: PAGE_HEIGHT,
  margin: MARGIN,
  logoColumnWidth: LOGO_WIDTH,
  postalColumnWidth: POSTAL_WIDTH,
  metadataClearanceY: META_CLEAR_Y,
  metadataClearanceHeight: META_CLEAR_HEIGHT,
  metadataPrimaryBaselineY: META_PRIMARY_Y,
  metadataSecondaryBaselineY: META_SECONDARY_Y,
  titleBaselineOffset: TITLE_BASELINE_OFFSET,
  titleClearOffset: TITLE_CLEAR_OFFSET,
  titleClearHeight: TITLE_CLEAR_HEIGHT,
} = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const CONTENT_WIDTH = officialDocumentPdfContentWidth();
const TITLE_X = MARGIN + LOGO_WIDTH;
const TITLE_WIDTH = CONTENT_WIDTH - LOGO_WIDTH - POSTAL_WIDTH;
const TITLE_BASELINE_Y = PAGE_HEIGHT - MARGIN - TITLE_BASELINE_OFFSET;
const TITLE_CLEAR_Y = TITLE_BASELINE_Y - TITLE_CLEAR_OFFSET;
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
    const { width, height } = page.getSize();
    if (Math.abs(width - PAGE_WIDTH) > 0.02 || Math.abs(height - PAGE_HEIGHT) > 0.02) {
      throw new Error("Report-card PDF renderer did not expose the expected official A4 page geometry.");
    }

    page.drawRectangle({
      x: 0,
      y: META_CLEAR_Y,
      width: PAGE_WIDTH,
      height: META_CLEAR_HEIGHT,
      color: rgb(1, 1, 1),
    });
    page.drawText(fitText(regular, metadata.snapshotLine, 5.2, 350), {
      x: MARGIN,
      y: META_PRIMARY_Y,
      size: 5.2,
      font: regular,
      color: MUTED,
    });
    const pageText = metadata.pageLabel(index + 1, pages.length);
    page.drawText(pageText, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageText, 5.2),
      y: META_PRIMARY_Y,
      size: 5.2,
      font: regular,
      color: MUTED,
    });
    const certification = fitText(regular, metadata.certificationLine, 5.2, 180);
    page.drawText(certification, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(certification, 5.2),
      y: META_SECONDARY_Y,
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
