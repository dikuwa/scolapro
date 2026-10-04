import assert from "node:assert/strict";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  renderClassListBatchXlsx,
  renderClassListXlsx,
} from "../../src/features/documents/server/render-official-class-list-xlsx.ts";
import { renderSportsHouseRosterXlsx } from "../../src/features/documents/server/sports-house-roster-document.ts";

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
assertWorksheetCellAttributesAreUnique(single);
assertNoDuplicateXmlAttributes(single);
const singlePaths = assertRelationshipTargetsExist(single);
assert.ok(singlePaths.has("xl/drawings/drawing1.xml"));
assert.ok(singlePaths.has("xl/media/class-list-logo.png"));

const batch = renderClassListBatchXlsx([input("10A"), input("10B", 10)], header, logoBytes);
assertWorkbook(batch, 2);
assertWorksheetCellAttributesAreUnique(batch);
assertNoDuplicateXmlAttributes(batch);
const batchPaths = assertRelationshipTargetsExist(batch);
assert.ok(batchPaths.has("xl/drawings/drawing1.xml"));
assert.ok(batchPaths.has("xl/drawings/drawing2.xml"));
assert.equal([...batchPaths].filter((entry) => entry === "xl/media/class-list-logo.png").length, 1);

const sports = renderSportsHouseRosterXlsx({
  header,
  schoolName: header.schoolName,
  academicYear: 2026,
  generatedAt: "04 October 2026",
  content: "combined",
  groupBy: "none",
  blankColumns: 3,
  sections: [{
    house: { id:"house-1",name:"Cheetahs",shortCode:"CH",colorHex:null,sortOrder:1,status:"active",createdByUserId:null,createdAt:"2026-01-01",updatedAt:"2026-01-01" },
    learners: [{ id:"sports-learner-1",name:"Learner One",admissionNumber:"4001",houseId:"house-1",houseName:"Cheetahs",houseColorHex:null,assignmentSource:"manual",isLocked:true,assignedAt:"2026-01-01",ageOnReferenceDate:15,ageGroupLabel:"U17",sex:"female",gradeId:"grade-10",gradeName:"Grade 10",registerClassId:"class-10a",registerClassName:"10A" }],
    staff: [{ id:"staff-1",name:"House Leader",employeeNumber:"E1",houseId:"house-1",houseName:"Cheetahs",roleKey:"leader",assignmentSource:"manual",isLocked:true,assignedAt:"2026-01-01" }],
  }],
}, logoBytes);
const sportsWorkbook = XLSX.read(sports,{type:"buffer",cellStyles:true});
const sportsSheet = sportsWorkbook.Sheets[sportsWorkbook.SheetNames[0]];
assert.equal(sportsSheet.B1.v,header.schoolName);
assert.equal(sportsSheet.A7.v,"No.");
assert.equal(sportsSheet["!cols"].length,13);
assertWorksheetCellAttributesAreUnique(sports);
assertNoDuplicateXmlAttributes(sports);
const sportsPaths = assertRelationshipTargetsExist(sports);
assert.ok(sportsPaths.has("xl/drawings/drawing1.xml"));

process.stdout.write("generated class-list XLSX packages are internally consistent\n");
