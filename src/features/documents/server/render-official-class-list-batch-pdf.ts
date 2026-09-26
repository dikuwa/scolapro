import "server-only";

import { PDFDocument } from "pdf-lib";
import type { OfficialClassListPdfInput } from "@/features/documents/server/render-official-class-list-pdf";
import { renderOfficialClassListPdf } from "@/features/documents/server/render-official-class-list-pdf";

export async function renderOfficialClassListBatchPdf(
  inputs: OfficialClassListPdfInput[],
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (!inputs.length) throw new Error("At least one class list is required for PDF export.");

  const output = await PDFDocument.create();
  output.setTitle(inputs.length === 1 ? "Class list" : `${inputs.length} class lists`);
  output.setAuthor("ScolaPro");
  output.setCreator("ScolaPro official document renderer");
  output.setProducer("ScolaPro");
  output.setCreationDate(new Date(0));
  output.setModificationDate(new Date(0));

  for (const input of inputs) {
    const rendered = await renderOfficialClassListPdf(input);
    const source = await PDFDocument.load(rendered.bytes);
    const pages = await output.copyPages(source, source.getPageIndices());
    for (const page of pages) output.addPage(page);
  }

  return {
    bytes: await output.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }),
    pageCount: output.getPageCount(),
  };
}
