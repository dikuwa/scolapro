import "server-only";

import { rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { OFFICIAL_DOCUMENT_PDF_GEOMETRY } from "@/features/documents/server/official-document-chrome";
import { fitOfficialDocumentPdfText } from "@/features/documents/server/official-document-pdf-header";

const {
  pageWidth: PAGE_WIDTH,
  margin: MARGIN,
  metadataClearanceY: META_CLEAR_Y,
  metadataClearanceHeight: META_CLEAR_HEIGHT,
  metadataPrimaryBaselineY: META_PRIMARY_Y,
  metadataSecondaryBaselineY: META_SECONDARY_Y,
} = OFFICIAL_DOCUMENT_PDF_GEOMETRY;

const MUTED = rgb(0.38, 0.38, 0.38);

type OfficialDocumentPdfFooterInput = {
  page: PDFPage;
  font: PDFFont;
  pageNumber: number;
  pageCount: number;
  primaryLeft: string;
  secondaryLeft?: string | null;
  secondaryRight?: string | null;
  clearArea?: boolean;
  primaryFontSize?: number;
  secondaryFontSize?: number;
  primaryLeftMaxWidth?: number;
  secondaryLeftMaxWidth?: number;
  secondaryRightMaxWidth?: number;
};

/**
 * Shared physical footer/provenance renderer for official A4 PDFs.
 *
 * The semantic footer text remains owned by each document family, while this
 * helper keeps the page number, baselines, margins, clipping, and optional
 * footer-area clearing consistent across generated official documents.
 */
export function drawOfficialDocumentPdfFooter(input: OfficialDocumentPdfFooterInput) {
  const primarySize = input.primaryFontSize ?? 5.2;
  const secondarySize = input.secondaryFontSize ?? primarySize;

  if (input.clearArea) {
    input.page.drawRectangle({
      x: 0,
      y: META_CLEAR_Y,
      width: PAGE_WIDTH,
      height: META_CLEAR_HEIGHT,
      color: rgb(1, 1, 1),
    });
  }

  const primaryLeft = fitOfficialDocumentPdfText(
    input.font,
    input.primaryLeft,
    primarySize,
    input.primaryLeftMaxWidth ?? 350,
  );
  input.page.drawText(primaryLeft, {
    x: MARGIN,
    y: META_PRIMARY_Y,
    size: primarySize,
    font: input.font,
    color: MUTED,
  });

  const pageText = `Page ${input.pageNumber} of ${input.pageCount}`;
  input.page.drawText(pageText, {
    x: PAGE_WIDTH - MARGIN - input.font.widthOfTextAtSize(pageText, primarySize),
    y: META_PRIMARY_Y,
    size: primarySize,
    font: input.font,
    color: MUTED,
  });

  const secondaryLeft = input.secondaryLeft?.trim() ?? "";
  if (secondaryLeft) {
    input.page.drawText(
      fitOfficialDocumentPdfText(
        input.font,
        secondaryLeft,
        secondarySize,
        input.secondaryLeftMaxWidth ?? 350,
      ),
      {
        x: MARGIN,
        y: META_SECONDARY_Y,
        size: secondarySize,
        font: input.font,
        color: MUTED,
      },
    );
  }

  const secondaryRight = input.secondaryRight?.trim() ?? "";
  if (secondaryRight) {
    const rendered = fitOfficialDocumentPdfText(
      input.font,
      secondaryRight,
      secondarySize,
      input.secondaryRightMaxWidth ?? 180,
    );
    input.page.drawText(rendered, {
      x: PAGE_WIDTH - MARGIN - input.font.widthOfTextAtSize(rendered, secondarySize),
      y: META_SECONDARY_Y,
      size: secondarySize,
      font: input.font,
      color: MUTED,
    });
  }
}
