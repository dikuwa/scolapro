import "server-only";

import { PDFDocument, rgb } from "pdf-lib";
import {
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  officialDocumentPdfContentWidth,
} from "@/features/documents/server/official-document-chrome";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import { buildOfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { buildOfficialDocumentMetadata } from "@/features/documents/server/official-document-metadata";
import {
  OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT,
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
} from "@/features/documents/server/official-document-pdf-header";
import { renderReportCardPdf } from "@/features/reporting/server/render-report-card-pdf";
import {
  buildReportCardTemplateModel,
  type ReportCardRenderInput,
} from "@/features/reporting/server/report-card-template-model";

const {
  pageWidth: PAGE_WIDTH,
  pageHeight: PAGE_HEIGHT,
  margin: MARGIN,
} = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const CONTENT_WIDTH = officialDocumentPdfContentWidth();

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
  const resources = await createOfficialDocumentPdfResources(pdf, header, input.logoBytes);
  const { regular } = resources;
  const pages = pdf.getPages();

  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    if (Math.abs(width - PAGE_WIDTH) > 0.02 || Math.abs(height - PAGE_HEIGHT) > 0.02) {
      throw new Error("Report-card PDF renderer did not expose the expected official A4 page geometry.");
    }

    drawOfficialDocumentPdfFooter({
      page,
      font: regular,
      pageNumber: index + 1,
      pageCount: pages.length,
      primaryLeft: metadata.snapshotLine,
      secondaryRight: metadata.certificationLine,
      clearArea: true,
      primaryFontSize: 5.2,
      secondaryFontSize: 5.2,
      primaryLeftMaxWidth: 350,
      secondaryRightMaxWidth: 180,
    });
  });

  const firstPage = pdf.getPage(0);
  firstPage.drawRectangle({
    x: MARGIN - 1,
    y: PAGE_HEIGHT - MARGIN - OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT - 1,
    width: CONTENT_WIDTH + 2,
    height: OFFICIAL_DOCUMENT_PDF_HEADER_HEIGHT + 2,
    color: rgb(1, 1, 1),
  });
  drawOfficialDocumentPdfHeader(firstPage, header, resources);

  return {
    bytes: await pdf.save(),
    pageCount: rendered.pageCount,
  };
}
