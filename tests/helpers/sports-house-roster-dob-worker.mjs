import assert from "node:assert/strict";
import zlib from "node:zlib";
import * as XLSX from "xlsx";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import {
  DEFAULT_SPORTS_HOUSE_ROSTER_COLUMNS,
  renderSportsHouseRosterHtml,
  renderSportsHouseRosterPdf,
  renderSportsHouseRosterXlsx,
} from "../../src/features/documents/server/sports-house-roster-document.ts";

const header = {
  mode: "internal_school",
  schoolName: "ScolaPro Test School",
  schoolEmisNumber: "TEST-1",
  formerName: null,
  logoUrl: "",
  logoStoragePath: "",
  schoolNameFont: "default",
  contactLines: [],
  postalLines: [],
  governedCoatOfArms: { key: "test", version: "test", url: "", alt: "Coat of Arms" },
  provenance: { source: "test" },
};

const learner = {
  id: "learner-1",
  name: "Synthetic Learner",
  admissionNumber: "TEST-001",
  dateOfBirth: "2010-05-14",
  houseId: "house-1",
  houseName: "Test House",
  houseColorHex: null,
  assignmentSource: "manual",
  isLocked: false,
  assignedAt: null,
  ageOnReferenceDate: 16,
  ageGroupLabel: null,
  sex: "female",
  gradeId: "grade-1",
  gradeName: "Grade 10",
  registerClassId: "class-1",
  registerClassName: "10A",
};

function documentInput(learnerColumns) {
  return {
    header,
    schoolName: header.schoolName,
    academicYear: 2026,
    generatedAt: "04 November 2026",
    content: "learners",
    groupBy: "none",
    blankColumns: 0,
    learnerColumns,
    sections: [{
      house: { id: "house-1", name: "Test House", shortCode: null, colorHex: null, sortOrder: 1, status: "active", createdByUserId: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      learners: [learner, { ...learner, id: "learner-2", name: "Unrecorded Learner", dateOfBirth: null }],
      staff: [],
    }],
  };
}

async function extractPdfText(bytes) {
  const doc = await PDFDocument.load(bytes);
  let text = "";
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const streams = contents instanceof PDFArray
      ? contents.asArray().map((reference) => doc.context.lookup(reference))
      : [contents];
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) continue;
      const raw = Buffer.from(stream.getContents());
      let decoded;
      try { decoded = zlib.inflateSync(raw).toString("latin1"); } catch { decoded = raw.toString("latin1"); }
      for (const match of decoded.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        const value = Buffer.from(match[1], "hex").toString("latin1");
        if (/^[\x20-\x7E]+$/.test(value)) text += `${value} `;
      }
    }
  }
  return text;
}

assert.deepEqual(DEFAULT_SPORTS_HOUSE_ROSTER_COLUMNS, ["grade", "class", "sex", "age", "age_group"]);

const defaultInput = documentInput([...DEFAULT_SPORTS_HOUSE_ROSTER_COLUMNS]);
const defaultHtml = renderSportsHouseRosterHtml(defaultInput);
const defaultSheet = XLSX.read(renderSportsHouseRosterXlsx(defaultInput), { type: "buffer" }).Sheets["Test House"];
const defaultPdfText = await extractPdfText(await renderSportsHouseRosterPdf(defaultInput));
assert.doesNotMatch(defaultHtml, /<th>DOB<\/th>|14\/05\/2010/);
assert.ok(!Object.values(defaultSheet).some((cell) => cell?.v === "DOB" || cell?.v === "14/05/2010"));
assert.doesNotMatch(defaultPdfText, /DOB|14\/05\/2010/);

const dobInput = documentInput(["dob"]);
const dobHtml = renderSportsHouseRosterHtml(dobInput);
const dobWorkbook = XLSX.read(renderSportsHouseRosterXlsx(dobInput), { type: "buffer" });
const dobSheet = dobWorkbook.Sheets["Test House"];
const dobPdfText = await extractPdfText(await renderSportsHouseRosterPdf(dobInput));
assert.match(dobHtml, /<th>DOB<\/th>/);
assert.match(dobHtml, /<td>14\/05\/2010<\/td>/);
assert.match(dobHtml, /Unrecorded Learner<\/td><td><\/td>/);
assert.equal(dobSheet.C7.v, "DOB");
assert.equal(dobSheet.C8.v, "14/05/2010");
assert.equal(dobSheet.C9.v, "");
assert.match(dobPdfText, /DOB/);
assert.match(dobPdfText, /14\/05\/2010/);
console.log("DOB export formats and defaults verified");
