import "server-only";

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  officialDocumentPdfContentWidth,
} from "@/features/documents/server/official-document-chrome";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  createOfficialDocumentPdfResources,
  type OfficialDocumentPdfResources,
  drawOfficialDocumentPdfCentered,
  drawOfficialDocumentPdfHeader,
  officialDocumentPdfSafeText,
} from "@/features/documents/server/official-document-pdf-header";
import type { TeachingPrintPack } from "./teaching-print-pack";

const { pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, margin: MARGIN } =
  OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const CONTENT_WIDTH = officialDocumentPdfContentWidth();
const INK = rgb(0.08, 0.08, 0.08);
const LINE = rgb(0.35, 0.35, 0.35);
const MUTED = rgb(0.35, 0.35, 0.35);
const BODY_SIZE = 7.2;
const LINE_HEIGHT = 10;
const FOOTER_RESERVE = 42;

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = officialDocumentPdfSafeText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (font.widthOfTextAtSize(next, size) <= width) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

type Writer = {
  pdf: PDFDocument;
  header: OfficialDocumentHeaderModel;
  resources: OfficialDocumentPdfResources;
  regular: PDFFont;
  bold: PDFFont;
  pages: PDFPage[];
  page: PDFPage;
  y: number;
};

function newPage(writer: Writer) {
  const page = writer.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  writer.page = page;
  writer.pages.push(page);
  writer.y = drawOfficialDocumentPdfHeader(page, writer.header, writer.resources) - 8;
}

function ensure(writer: Writer, height: number) {
  if (writer.y - height < MARGIN + FOOTER_RESERVE) newPage(writer);
}

function heading(writer: Writer, text: string) {
  ensure(writer, 22);
  writer.page.drawText(text, { x: MARGIN, y: writer.y, size: 9.5, font: writer.bold, color: INK });
  writer.y -= 5;
  writer.page.drawLine({ start: { x: MARGIN, y: writer.y }, end: { x: MARGIN + CONTENT_WIDTH, y: writer.y }, thickness: 0.5, color: LINE });
  writer.y -= 12;
}

function paragraph(writer: Writer, label: string, value: string) {
  const text = label ? `${label}: ${value || "-"}` : value || "-";
  const lines = wrap(writer.regular, text, BODY_SIZE, CONTENT_WIDTH);
  ensure(writer, lines.length * LINE_HEIGHT + 4);
  lines.forEach((line) => {
    writer.page.drawText(line, { x: MARGIN, y: writer.y, size: BODY_SIZE, font: writer.regular, color: INK });
    writer.y -= LINE_HEIGHT;
  });
  writer.y -= 2;
}

function bulletList(writer: Writer, values: string[]) {
  if (!values.length) return paragraph(writer, "", "No registry value available.");
  values.forEach((value) => paragraph(writer, "", `• ${value}`));
}

export async function renderTeachingPrintPackPdf(input: {
  header: OfficialDocumentHeaderModel;
  pack: TeachingPrintPack;
  generatedAt: string;
  logoBytes?: Uint8Array | null;
}): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.pack.subjectName} teaching print pack`);
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro shared document renderer");
  pdf.setProducer("ScolaPro");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const resources = await createOfficialDocumentPdfResources(pdf, input.header, input.logoBytes);
  const first = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const writer: Writer = {
    pdf,
    header: input.header,
    resources,
    regular: resources.regular,
    bold: resources.bold,
    pages: [first],
    page: first,
    y: drawOfficialDocumentPdfHeader(first, input.header, resources) - 8,
  };

  drawOfficialDocumentPdfCentered(writer.page, writer.bold, "Teaching Print Pack", 12, MARGIN, CONTENT_WIDTH, writer.y);
  writer.y -= 18;
  paragraph(writer, "", `${input.pack.teacherName} | ${input.pack.subjectName} | ${input.pack.gradeName} · ${input.pack.className} | ${input.pack.academicYear}${input.pack.termName ? ` | ${input.pack.termName}` : ""}`);
  paragraph(writer, "", `Lesson ${input.pack.plannedOn} | ${input.pack.plannedPeriods} period(s) | status ${input.pack.preparationStatus}`);
  paragraph(writer, "", "ScolaPro teaching record export. This is not presented as an official NIED or Ministry form.");

  heading(writer, "Lesson preparation");
  paragraph(writer, "Theme / topic", [input.pack.theme, input.pack.topic].filter(Boolean).join(" · ") || "—");
  paragraph(writer, "Curriculum version", input.pack.curriculumVersion || "—");

  const labels: Array<[string, string]> = [
    ["Resources / materials", "resources"],
    ["Introduction", "introduction"],
    ["Lesson structure", "lessonStructure"],
    ["Teacher activities", "teacherActivities"],
    ["Learner activities", "learnerActivities"],
    ["Consolidation", "consolidation"],
    ["Assessment / homework / tasks / exercises", "assessment"],
    ["Homework monitoring", "homeworkMonitoring"],
    ["English Across Curriculum", "englishAcrossCurriculum"],
    ["Compensatory teaching", "compensatoryTeaching"],
    ["Reflection / amendments", "reflectionAmendments"],
  ];
  labels.forEach(([label, key]) => paragraph(writer, label, input.pack.preparation[key] || "—"));

  heading(writer, "Curriculum context");
  paragraph(writer, "Objectives", "");
  bulletList(writer, input.pack.objectives);
  paragraph(writer, "Competencies", "");
  bulletList(writer, input.pack.competencies);

  heading(writer, "Connected year plan / scheme view");
  if (!input.pack.plan.items.length) paragraph(writer, "", "No connected plan items available.");
  input.pack.plan.items.forEach((item) => {
    paragraph(
      writer,
      `#${item.sequence}`,
      `${item.theme ? `${item.theme} · ` : ""}${item.topic} | ${item.start ?? "—"} → ${item.end ?? "—"} | ${item.periods} period(s)`,
    );
  });

  heading(writer, "Coverage / reflection");
  if (input.pack.coverage) {
    paragraph(writer, "Taught on", input.pack.coverage.taughtOn);
    paragraph(writer, "Coverage", input.pack.coverage.state);
    paragraph(writer, "Periods used", String(input.pack.coverage.periodsUsed));
    paragraph(writer, "Reflection", input.pack.coverage.reflection || "—");
    paragraph(writer, "Compensatory action", input.pack.coverage.compensatoryAction || "—");
  } else {
    paragraph(writer, "", "No actual teaching / coverage record exists for this scheduled lesson.");
  }

  heading(writer, "Review provenance");
  paragraph(writer, "Preparation ID", input.pack.preparationId);
  paragraph(writer, "Plan ID", input.pack.plan.id);
  paragraph(writer, "Plan", `${input.pack.plan.level} / ${input.pack.plan.status}`);
  paragraph(writer, "Submitted", input.pack.submittedAt || "—");
  paragraph(writer, "Reviewed", input.pack.reviewedAt || "—");
  paragraph(writer, "Review note", input.pack.reviewNote || "—");

  writer.pages.forEach((page, index) => {
    drawOfficialDocumentPdfFooter({
      page,
      font: writer.regular,
      pageNumber: index + 1,
      pageCount: writer.pages.length,
      primaryLeft: `Generated ${input.generatedAt}`,
      secondaryLeft: `Preparation ${input.pack.preparationId}`,
      primaryFontSize: 5.4,
      secondaryFontSize: 5,
      primaryLeftMaxWidth: 360,
    });
  });

  return {
    bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }),
    pageCount: writer.pages.length,
  };
}
