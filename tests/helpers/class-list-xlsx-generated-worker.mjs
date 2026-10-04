import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  renderClassListBatchXlsx,
  renderClassListXlsx,
} from "../../src/features/documents/server/render-official-class-list-xlsx.ts";
import { renderOfficialClassListPdf } from "../../src/features/documents/server/render-official-class-list-pdf.ts";
import { renderSportsHouseRosterPdf, renderSportsHouseRosterXlsx } from "../../src/features/documents/server/sports-house-roster-document.ts";
import { renderAcademicScheduleXlsx } from "../../src/features/reporting/server/render-academic-schedule-xlsx.ts";
import { renderAcademicSchedulePdf } from "../../src/features/reporting/server/render-academic-schedule-pdf.ts";

const header = {
  mode: "internal_school",
  schoolName: "Namib High School",
  schoolEmisNumber: "1234",
  formerName: "formerly Deutsche Oberschule Swakopmund",
  logoUrl: "",
  logoStoragePath: "",
  schoolNameFont: "old_english",
  contactLines: [
    { key: "address", label: "Address", value: "Daniel Tjongarero Avenue", text: "Address: Daniel Tjongarero Avenue" },
    { key: "telephone", label: "Tel", value: "+264 64 404 478", text: "Tel: +264 64 404 478" },
    { key: "fax", label: "Fax", value: "+264 64 404 155", text: "Fax: +264 64 404 155" },
    { key: "email", label: "Email", value: "namibhs@example.test", text: "Email: namibhs@example.test" },
  ],
  postalLines: ["P O Box 118", "Swakopmund"],
  governedCoatOfArms: { key: "namibia-coat-of-arms", version: "test", url: "", alt: "Coat of Arms" },
  provenance: { source: "live_school_profile", governedAssetKey: "namibia-coat-of-arms", governedAssetVersion: "test" },
};

function input(className, learnerOffset = 0) {
  return {
    academicYear: 2026,
    schoolName: header.schoolName,
    canUseAllScope: true,
    canViewGuardianFields: false,
    effectiveScope: "all",
    options: { register_class: [], grade: [], subject: [], teacher_subject: [], teaching_group: [], field_group: [] },
    configuration: {
      scope: "all",
      rosterType: "register_class",
      rosterId: `class-${className}`,
      columns: ["admissionNumber", "sex", "registerClass", "status"],
      blankColumns: 3,
    },
    title: `${className}: Class List`,
    grade: "Grade 10",
    className,
    registerTeacherName: "A Teacher",
    roomName: "B12",
    responsibleTeacherName: "A Teacher",
    learners: Array.from({ length: 4 }, (_, index) => ({
      learnerId: `learner-${learnerOffset + index}`,
      learnerName: `Learner ${learnerOffset + index}`,
      admissionNumber: String(4000 + learnerOffset + index),
      sex: index % 2 ? "female" : "male",
      registerClass: className,
      status: "current",
      guardianName: null,
      guardianPhone: null,
      guardianAddress: null,
      emergencyContact: null,
    })),
  };
}

function normalizedPackagePaths(cfb) {
  return new Set((cfb.FullPaths ?? []).map((entry) => entry
    .replace(/^\/?Root Entry\//, "")
    .replace(/^\//, "")));
}

function assertWorksheetCellAttributesAreUnique(bytes) {
  const CFB = XLSX.CFB ?? XLSX.default?.CFB;
  assert.ok(CFB, "SheetJS CFB package reader is required");
  const cfb = CFB.read(Buffer.from(bytes), { type: "buffer" });
  const paths = normalizedPackagePaths(cfb);
  const worksheetPaths = [...paths].filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry));

  for (const worksheetPath of worksheetPaths) {
    const found = CFB.find(cfb, worksheetPath) ?? CFB.find(cfb, "/" + worksheetPath);
    assert.ok(found?.content, "Worksheet part " + worksheetPath + " should be readable");
    const xml = Buffer.from(found.content).toString("utf8");
    for (const match of xml.matchAll(/<c\b([^>]*)>/g)) {
      const attributes = [...match[1].matchAll(/([A-Za-z_:][\w:.-]*)\s*=/g)].map((item) => item[1]);
      assert.equal(
        new Set(attributes).size,
        attributes.length,
        worksheetPath + " cell tag must not contain duplicate attributes: <c" + match[1] + ">",
      );
    }
  }
}

function assertNoDuplicateXmlAttributes(bytes) {
  const CFB = XLSX.CFB ?? XLSX.default?.CFB;
  assert.ok(CFB, "SheetJS CFB package reader is required");
  const cfb = CFB.read(Buffer.from(bytes), { type: "buffer" });
  const paths = normalizedPackagePaths(cfb);
  for (const packagePath of paths) {
    if (!packagePath.endsWith(".xml") && !packagePath.endsWith(".rels")) continue;
    const found = CFB.find(cfb, packagePath) ?? CFB.find(cfb, `/${packagePath}`);
    if (!found?.content) continue;
    const xml = Buffer.from(found.content).toString("utf8");
    for (const tag of xml.matchAll(/<([A-Za-z_][^\s/>]*)([^<>]*?)\/?>(?![^<]*>)/g)) {
      const names = [...tag[2].matchAll(/\s([A-Za-z_:][\w:.-]*)\s*=/g)].map((match) => match[1]);
      const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
      assert.deepEqual(duplicates, [], `${packagePath} <${tag[1]}> must not contain duplicate attributes`);
    }
  }
}

function assertRelationshipTargetsExist(bytes) {
  const CFB = XLSX.CFB ?? XLSX.default?.CFB;
  assert.ok(CFB, "SheetJS CFB package reader is required");
  const cfb = CFB.read(Buffer.from(bytes), { type: "buffer" });
  const paths = normalizedPackagePaths(cfb);
  const relationshipPaths = [...paths].filter((entry) => entry.endsWith(".rels"));

  for (const relationshipPath of relationshipPaths) {
    const found = CFB.find(cfb, relationshipPath) ?? CFB.find(cfb, `/${relationshipPath}`);
    assert.ok(found?.content, `Relationship part ${relationshipPath} should be readable`);
    const xml = Buffer.from(found.content).toString("utf8");
    const sourcePart = relationshipPath === "_rels/.rels"
      ? ""
      : relationshipPath.replace("/_rels/", "/").replace(/\.rels$/, "");
    const baseDirectory = path.posix.dirname(sourcePart);
    for (const match of xml.matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*>/g)) {
      const [relationship, target] = match;
      if (/\bTargetMode="External"/.test(relationship)) continue;
      const resolved = target.startsWith("/")
        ? target.slice(1)
        : path.posix.normalize(path.posix.join(baseDirectory === "." ? "" : baseDirectory, target));
      assert.ok(paths.has(resolved), `${relationshipPath} target ${target} should resolve to ${resolved}`);
    }
  }

  return paths;
}

function schoolNameFontName(bytes, sheetNumber = 1) {
  const CFB = XLSX.CFB ?? XLSX.default?.CFB;
  assert.ok(CFB, "SheetJS CFB package reader is required");
  const cfb = CFB.read(Buffer.from(bytes), { type: "buffer" });

  const readPart = (packagePath) => {
    const found = CFB.find(cfb, packagePath) ?? CFB.find(cfb, "/" + packagePath);
    assert.ok(found?.content, packagePath + " should be readable");
    return Buffer.from(found.content).toString("utf8");
  };

  const sheetXml = readPart(`xl/worksheets/sheet${sheetNumber}.xml`);
  const b1 = sheetXml.match(/<c\b(?=[^>]*\br="B1")(?=[^>]*\bs="(\d+)")[^>]*>/);
  assert.ok(b1, "B1 should carry an explicit governed style");
  const styleId = Number(b1[1]);

  const stylesXml = readPart("xl/styles.xml");
  const cellXfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  assert.ok(cellXfs, "cellXfs should exist");
  const styles = [...cellXfs[1].matchAll(/<xf\b([^>]*)>/g)];
  assert.ok(styles[styleId], "B1 style should resolve");
  const fontIdMatch = styles[styleId][1].match(/\bfontId="(\d+)"/);
  assert.ok(fontIdMatch, "B1 style should reference a font");
  const fontId = Number(fontIdMatch[1]);

  const fontsBlock = stylesXml.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/);
  assert.ok(fontsBlock, "fonts should exist");
  const fonts = [...fontsBlock[1].matchAll(/<font>([\s\S]*?)<\/font>/g)];
  assert.ok(fonts[fontId], "B1 font should resolve");
  const fontName = fonts[fontId][1].match(/<name\s+val="([^"]+)"\s*\/>/);
  assert.ok(fontName, "B1 font should expose a family name");
  return fontName[1];
}

function assertWorkbook(bytes, expectedSheets) {
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer", cellStyles: true });
  assert.equal(workbook.SheetNames.length, expectedSheets);
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    assert.equal(sheet.B1.v, header.schoolName);
    assert.match(String(sheet.A7.v), /No\./);
    assert.ok((sheet["!merges"] ?? []).some((range) => range.s.r === 0 && range.e.r === 0));
  }
}

const logoBytes = new Uint8Array(await import("node:fs/promises").then(({ readFile }) =>
  readFile(new URL("../../public/brand/schools/namib-high/crest.png", import.meta.url)),
));
const single = renderClassListXlsx(input("10A"), header, logoBytes);
assertWorkbook(single, 1);
assert.equal(schoolNameFontName(single), "Old English Text MT");
assertWorksheetCellAttributesAreUnique(single);
assertNoDuplicateXmlAttributes(single);
const singlePaths = assertRelationshipTargetsExist(single);
assert.ok(singlePaths.has("xl/drawings/drawing1.xml"));
assert.ok(singlePaths.has("xl/media/class-list-logo.png"));
const classPdfInput = input("10A");
const classPdf = await renderOfficialClassListPdf({
  header,
  logoBytes,
  academicYear: classPdfInput.academicYear,
  grade: classPdfInput.grade,
  registerClass: classPdfInput.className,
  rows: classPdfInput.learners.map((learner) => ({
    learnerName: learner.learnerName,
    admissionNumber: learner.admissionNumber,
    sex: learner.sex,
    registerClass: learner.registerClass,
    status: learner.status,
    guardianName: learner.guardianName,
    guardianPhone: learner.guardianPhone,
    guardianAddress: learner.guardianAddress,
    emergencyContact: learner.emergencyContact,
  })),
  columns: classPdfInput.configuration.columns,
  blankColumns: classPdfInput.configuration.blankColumns,
  roomName: classPdfInput.roomName,
  responsibleTeacherName: classPdfInput.responsibleTeacherName,
  rosterTitle: classPdfInput.title,
});

const batch = renderClassListBatchXlsx([input("10A"), input("10B", 10)], header, logoBytes);
assertWorkbook(batch, 2);
assert.equal(schoolNameFontName(batch, 1), "Old English Text MT");
assert.equal(schoolNameFontName(batch, 2), "Old English Text MT");
assertWorksheetCellAttributesAreUnique(batch);
assertNoDuplicateXmlAttributes(batch);
const batchPaths = assertRelationshipTargetsExist(batch);
assert.ok(batchPaths.has("xl/drawings/drawing1.xml"));
assert.ok(batchPaths.has("xl/drawings/drawing2.xml"));
assert.equal([...batchPaths].filter((entry) => entry === "xl/media/class-list-logo.png").length, 1);

const sportsInput = {
  header,
  schoolName: header.schoolName,
  academicYear: 2026,
  generatedAt: "04 October 2026",
  content: "combined",
  groupBy: "none",
  blankColumns: 3,
  learnerColumns: ["grade", "class", "sex", "age", "age_group"],
  sections: [{
    house: { id:"house-1",name:"Cheetahs",shortCode:"CH",colorHex:null,sortOrder:1,status:"active",createdByUserId:null,createdAt:"2026-01-01",updatedAt:"2026-01-01" },
    learners: [{ id:"sports-learner-1",name:"Learner One",admissionNumber:"4001",houseId:"house-1",houseName:"Cheetahs",houseColorHex:null,assignmentSource:"manual",isLocked:true,assignedAt:"2026-01-01",ageOnReferenceDate:15,ageGroupLabel:"U17",sex:"female",gradeId:"grade-10",gradeName:"Grade 10",registerClassId:"class-10a",registerClassName:"10A" }],
    staff: [{ id:"staff-1",name:"House Leader",employeeNumber:"E1",houseId:"house-1",houseName:"Cheetahs",roleKey:"leader",assignmentSource:"manual",isLocked:true,assignedAt:"2026-01-01" }],
  }],
};
const sports = renderSportsHouseRosterXlsx(sportsInput, logoBytes);
const sportsPdf = await renderSportsHouseRosterPdf(sportsInput);
const sportsWorkbook = XLSX.read(sports,{type:"buffer",cellStyles:true});
const sportsSheet = sportsWorkbook.Sheets[sportsWorkbook.SheetNames[0]];
assert.equal(sportsSheet.B1.v,header.schoolName);
assert.equal(sportsSheet.A7.v,"No.");
assert.equal(sportsSheet["!cols"].length,10);
assert.equal(sportsSheet.C7.v,"Grade");
assert.equal(sportsSheet.G7.v,"Age group");
assert.notEqual(sportsSheet.H7?.v,"Source");
assert.notEqual(sportsSheet.H7?.v,"Lock");
assert.equal(schoolNameFontName(sports), "Old English Text MT");
assertWorksheetCellAttributesAreUnique(sports);
assertNoDuplicateXmlAttributes(sports);
const sportsPaths = assertRelationshipTargetsExist(sports);
assert.ok(sportsPaths.has("xl/drawings/drawing1.xml"));

const schedulePayload = {
  scheduleType: "term_schedule",
  title: "Term Schedule",
  basis: "official",
  academicYear: 2026,
  termNumber: 1,
  scopeKey: "period:term|grade-id:grade-10|class-ids:class-10a",
  period: "term",
  periodLabel: "Term 1",
  gradeId: "grade-10",
  grade: "Grade 10",
  classIds: ["class-10a"],
  classNames: ["10A"],
  generatedAt: "04 October 2026",
  sourceDescription: "Acceptance fixture",
  columns: ["No.", "Learner", "Mathematics", "English", "Average %", "Rank", "Recommendation", "Remarks"],
  rows: [{ "No.": 1, Learner: "Learner One", Mathematics: 72, English: 68, "Average %": 70, Rank: 1, Recommendation: "Promote", Remarks: "Good progress" }],
  rowCount: 1,
  notes: [],
  subjects: [],
  footerRows: [],
};
const schedule = renderAcademicScheduleXlsx(schedulePayload, header, undefined, logoBytes);
const schedulePdf = await renderAcademicSchedulePdf(schedulePayload, header, undefined, logoBytes);
const scheduleWorkbook = XLSX.read(schedule, { type: "buffer", cellStyles: true });
const scheduleSheet = scheduleWorkbook.Sheets[scheduleWorkbook.SheetNames[0]];
assert.equal(scheduleSheet.B1.v, header.schoolName);
assert.equal(scheduleSheet.A7.v, "No.");
assert.equal(schoolNameFontName(schedule), "Old English Text MT");
assertWorksheetCellAttributesAreUnique(schedule);
assertNoDuplicateXmlAttributes(schedule);
const schedulePaths = assertRelationshipTargetsExist(schedule);
assert.ok(schedulePaths.has("xl/drawings/drawing1.xml"));

const defaultHeader = { ...header, schoolNameFont: "default" };
const defaultSingle = renderClassListXlsx(input("10C", 20), defaultHeader, logoBytes);
assertWorkbook(defaultSingle, 1);
assert.equal(schoolNameFontName(defaultSingle), "Aptos Display");
assertWorksheetCellAttributesAreUnique(defaultSingle);
assertNoDuplicateXmlAttributes(defaultSingle);
assertRelationshipTargetsExist(defaultSingle);

if (process.env.SCOLAPRO_XLSX_OUTPUT_DIR) {
  await mkdir(process.env.SCOLAPRO_XLSX_OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(process.env.SCOLAPRO_XLSX_OUTPUT_DIR, "class-list-single.xlsx"), Buffer.from(single)),
    writeFile(path.join(process.env.SCOLAPRO_XLSX_OUTPUT_DIR, "class-list-batch.xlsx"), Buffer.from(batch)),
    writeFile(path.join(process.env.SCOLAPRO_XLSX_OUTPUT_DIR, "sports-house-roster.xlsx"), Buffer.from(sports)),
    writeFile(path.join(process.env.SCOLAPRO_XLSX_OUTPUT_DIR, "class-list.pdf"), Buffer.from(classPdf.bytes)),
    writeFile(path.join(process.env.SCOLAPRO_XLSX_OUTPUT_DIR, "sports-house-roster.pdf"), Buffer.from(sportsPdf)),
    writeFile(path.join(process.env.SCOLAPRO_XLSX_OUTPUT_DIR, "academic-schedule.xlsx"), Buffer.from(schedule)),
    writeFile(path.join(process.env.SCOLAPRO_XLSX_OUTPUT_DIR, "academic-schedule.pdf"), Buffer.from(schedulePdf)),
  ]);
}

process.stdout.write("generated class-list XLSX packages are internally consistent\n");
