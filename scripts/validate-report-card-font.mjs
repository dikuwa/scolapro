import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

const fontPath = join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "unifrakturcook",
  "files",
  "unifrakturcook-latin-700-normal.woff",
);
const fontBytes = await readFile(fontPath);
if (fontBytes.length < 1000) throw new Error("Bundled Old English report font is unexpectedly empty.");

const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const oldEnglish = await pdf.embedFont(fontBytes, { subset: true });
const page = pdf.addPage([595.28, 841.89]);
const sample = "Namib High School";
const sampleWidth = oldEnglish.widthOfTextAtSize(sample, 19);
if (!Number.isFinite(sampleWidth) || sampleWidth <= 0) {
  throw new Error("Bundled Old English report font could not measure report-card title text.");
}

page.drawText(sample, {
  x: 48,
  y: 780,
  size: 19,
  font: oldEnglish,
  color: rgb(0.08, 0.08, 0.08),
});
const output = await pdf.save();
if (pdf.getPageCount() !== 1 || output.length < 1000) {
  throw new Error("Bundled Old English report font could not produce a valid PDF.");
}

console.log(`Report-card Old English font smoke test passed (${fontBytes.length} font bytes, ${output.length} PDF bytes).`);
