import "server-only";

import { Buffer } from "node:buffer";
import { PDFDocument, rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import {
  OFFICIAL_DOCUMENT_A4_PAGE_RULE,
  OFFICIAL_DOCUMENT_HTML_HEADER_RULE,
  OFFICIAL_DOCUMENT_METADATA_RULE,
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
  OFFICIAL_DOCUMENT_PRINT_RULE,
} from "@/features/documents/server/official-document-chrome";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  fitOfficialDocumentPdfText,
} from "@/features/documents/server/official-document-pdf-header";
import {
  escapeOfficialDocumentHtml,
  renderOfficialDocumentHtmlHeader,
} from "@/features/documents/server/official-document-html-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { applyOfficialDocumentXlsxChrome } from "@/features/documents/server/official-document-xlsx-chrome";
import type { SportsHouse, SportsLearner, SportsStaff } from "@/features/sports-houses/server/queries";

export type SportsHouseRosterSection = {
  house: SportsHouse;
  learners: SportsLearner[];
  staff: SportsStaff[];
};

export type SportsHouseRosterColumn = "admission" | "grade" | "class" | "sex" | "age" | "age_group" | "source" | "lock";

export const DEFAULT_SPORTS_HOUSE_ROSTER_COLUMNS: readonly SportsHouseRosterColumn[] = ["grade", "class", "sex", "age", "age_group"];

export type SportsHouseRosterDocumentInput = {
  header: OfficialDocumentHeaderModel;
  schoolName: string;
  academicYear: number;
  sections: SportsHouseRosterSection[];
  generatedAt: string;
  content: "learners" | "staff" | "combined";
  groupBy: "none" | "age_group" | "sex" | "grade" | "class";
  blankColumns: number;
  learnerColumns: SportsHouseRosterColumn[];
};

function blankColumnLabels(count: number) {
  return Array.from({ length: count }, () => "");
}

function sexLabel(value: string | null) {
  const v = value?.trim().toLowerCase();
  if (v === "male" || v === "m") return "M";
  if (v === "female" || v === "f") return "F";
  return value ?? "";
}


type LearnerColumnDefinition = {
  key: SportsHouseRosterColumn;
  label: string;
  width: number;
  value: (learner: SportsLearner) => string;
};

const LEARNER_COLUMN_DEFINITIONS: Record<SportsHouseRosterColumn, LearnerColumnDefinition> = {
  admission: { key: "admission", label: "Admission No.", width: 68, value: (learner) => learner.admissionNumber ?? "" },
  grade: { key: "grade", label: "Grade", width: 50, value: (learner) => learner.gradeName ?? "" },
  class: { key: "class", label: "Class", width: 48, value: (learner) => learner.registerClassName ?? "" },
  sex: { key: "sex", label: "Sex", width: 28, value: (learner) => sexLabel(learner.sex) },
  age: { key: "age", label: "Age", width: 28, value: (learner) => learner.ageOnReferenceDate === null ? "" : String(learner.ageOnReferenceDate) },
  age_group: { key: "age_group", label: "Age group", width: 55, value: (learner) => learner.ageGroupLabel ?? "Unresolved" },
  source: { key: "source", label: "Source", width: 60, value: (learner) => learner.assignmentSource ?? "" },
  lock: { key: "lock", label: "Lock", width: 48, value: (learner) => learner.isLocked ? "Locked" : "Unlocked" },
};

function selectedLearnerColumns(input: SportsHouseRosterDocumentInput) {
  const selected = input.learnerColumns.length ? input.learnerColumns : [...DEFAULT_SPORTS_HOUSE_ROSTER_COLUMNS];
  return selected.map((key) => LEARNER_COLUMN_DEFINITIONS[key]);
}

function learnerGroupLabel(learner: SportsLearner, groupBy: SportsHouseRosterDocumentInput["groupBy"]) {
  if (groupBy === "age_group") return learner.ageGroupLabel ?? "Unresolved age group";
  if (groupBy === "sex") return sexLabel(learner.sex) || "Unspecified sex";
  if (groupBy === "grade") return learner.gradeName ?? "Unassigned grade";
  if (groupBy === "class") return learner.registerClassName ?? "Unassigned class";
  return "";
}

function groupedLearners(learners: SportsLearner[], groupBy: SportsHouseRosterDocumentInput["groupBy"]) {
  if (groupBy === "none") return [{ label: "", rows: learners }];
  const groups = new Map<string,SportsLearner[]>();
  for (const learner of learners) {
    const label = learnerGroupLabel(learner,groupBy);
    groups.set(label,[...(groups.get(label) ?? []),learner]);
  }
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([label,rows])=>({label,rows}));
}

function safeSheetName(value: string, used: Set<string>) {
  const base = value.replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "House";
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    const suffix = ` ${index++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate);
  return candidate;
}

export function renderSportsHouseRosterHtml(input: SportsHouseRosterDocumentInput): string {
  const columns = selectedLearnerColumns(input);
  const blankHeaders = blankColumnLabels(input.blankColumns).map(() => "<th></th>").join("");
  const blankCells = blankColumnLabels(input.blankColumns).map(() => "<td></td>").join("");
  const learnerColumnCount = 2 + columns.length + input.blankColumns;
  const includeSource = input.learnerColumns.includes("source");
  const includeLock = input.learnerColumns.includes("lock");
  const sectionMarkup = input.sections.map(({ house, learners, staff }) => {
    const leaders = staff.filter((person) => person.roleKey === "leader").map((person) => person.name);
    let learnerIndex = 0;
    const learnerRows = groupedLearners(learners,input.groupBy).map((group) =>
      `${group.label ? `<tr class="group-row"><td colspan="${learnerColumnCount}">${escapeOfficialDocumentHtml(group.label)}</td></tr>` : ""}${group.rows.map((learner) => {
        learnerIndex += 1;
        const values = columns.map((column) => `<td>${escapeOfficialDocumentHtml(column.value(learner))}</td>`).join("");
        return `<tr><td>${learnerIndex}</td><td>${escapeOfficialDocumentHtml(learner.name)}</td>${values}${blankCells}</tr>`;
      }).join("")}`
    ).join("");
    const staffHeaderExtras = `${includeSource ? "<th>Source</th>" : ""}${includeLock ? "<th>Lock</th>" : ""}`;
    const staffRows = staff.map((person) => `<tr><td>${escapeOfficialDocumentHtml(person.name)}</td><td>${escapeOfficialDocumentHtml(person.employeeNumber)}</td><td>${person.roleKey === "leader" ? "House leader" : "Member"}</td>${includeSource ? `<td>${escapeOfficialDocumentHtml(person.assignmentSource)}</td>` : ""}${includeLock ? `<td>${person.isLocked ? "Locked" : "Unlocked"}</td>` : ""}</tr>`).join("");
    const staffColumnCount = 3 + Number(includeSource) + Number(includeLock);
    return `<section class="house-block">
      <div class="house-heading"><h2>${escapeOfficialDocumentHtml(house.name)}</h2><p class="house-summary">Leader: ${escapeOfficialDocumentHtml(leaders.join(", ") || "Not assigned")} · ${learners.length} learners · ${staff.length} staff</p></div>
      ${input.content !== "staff" ? `<table><thead><tr><th>No.</th><th>Learner</th>${columns.map((column) => `<th>${escapeOfficialDocumentHtml(column.label)}</th>`).join("")}${blankHeaders}</tr></thead><tbody>${learnerRows || `<tr><td colspan="${learnerColumnCount}">No learners assigned.</td></tr>`}</tbody></table>` : ""}
      ${input.content !== "learners" ? `<h3>Staff</h3><table><thead><tr><th>Staff member</th><th>Employee No.</th><th>Role</th>${staffHeaderExtras}</tr></thead><tbody>${staffRows || `<tr><td colspan="${staffColumnCount}">No staff assigned.</td></tr>`}</tbody></table>` : ""}
    </section>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeOfficialDocumentHtml(input.schoolName)} - House Rosters ${input.academicYear}</title>
<style>
${OFFICIAL_DOCUMENT_A4_PAGE_RULE}
*{box-sizing:border-box}:root{--ink:#151515;--line:#4a4a4a;--muted:#666}
html,body{margin:0;padding:0;background:#fff;color:var(--ink)}body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:8px;line-height:1.25}
.report{padding:6mm 7mm 5mm}${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
.house-block{margin-top:10px;break-inside:auto}.house-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 0 6px}.house-block h2{font-size:12px;margin:0}.house-summary{margin:0;color:var(--muted);text-align:right}
.house-block h3{font-size:9px;margin:8px 0 3px}.group-row td{font-weight:700;background:#eef1f5}table{width:100%;border-collapse:collapse}th,td{border:1px solid var(--line);padding:2.5px 3px;vertical-align:middle}th{text-align:left;font-weight:700}thead{display:table-header-group}tr{break-inside:avoid}
${OFFICIAL_DOCUMENT_METADATA_RULE}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.report{padding:0}${OFFICIAL_DOCUMENT_PRINT_RULE}.house-block{break-after:page}.house-block:last-child{break-after:auto}}
</style></head><body><main class="report">
${renderOfficialDocumentHtmlHeader(input.header, undefined, { context: { title: "Sports / Houses Rosters", primaryContext: String(input.academicYear), summary: `${input.sections.length} house${input.sections.length === 1 ? "" : "s"}` } })}
${sectionMarkup}
<div class="document-meta"><span>Generated ${escapeOfficialDocumentHtml(input.generatedAt)}</span><span>${escapeOfficialDocumentHtml(input.schoolName)} · ${input.academicYear}</span></div>
</main></body></html>`;
}

export function renderSportsHouseRosterXlsx(input: SportsHouseRosterDocumentInput, logoBytes: Uint8Array | null = null): Buffer {
  const workbook = XLSX.utils.book_new();
  const used = new Set<string>();
  const chromeSheets: Array<{ tableHeaderRow: number; dataRowCount: number; columnCount: number; metaStartColumn: number }> = [];
  const selectedColumns = selectedLearnerColumns(input);
  const includeSource = input.learnerColumns.includes("source");
  const includeLock = input.learnerColumns.includes("lock");
  for (const { house, learners, staff } of input.sections) {
    const leaders = staff.filter((person) => person.roleKey === "leader").map((person) => person.name).join(", ") || "Not assigned";
    const learnerHeaders = ["No.","Learner",...selectedColumns.map((column) => column.label), ...blankColumnLabels(input.blankColumns)];
    const staffHeaders = ["Staff member","Employee No.","Role",...(includeSource ? ["Source"] : []),...(includeLock ? ["Lock"] : [])];
    const columnCount = Math.max(input.content === "staff" ? staffHeaders.length : learnerHeaders.length, 6);
    const metaStartColumn = Math.max(3, Math.floor(columnCount * 0.58));
    const blankRow = () => Array.from({ length: columnCount }, () => "");
    const rows: Array<Array<string | number>> = [
      blankRow(), blankRow(), blankRow(), blankRow(), blankRow(), blankRow(),
      ...(input.content !== "staff" ? [
        learnerHeaders,
        ...groupedLearners(learners,input.groupBy).flatMap((group) => [
          ...(group.label ? [[group.label]] : []),
          ...group.rows.map((learner,index) => [index+1,learner.name,...selectedColumns.map((column) => column.value(learner)), ...blankColumnLabels(input.blankColumns)]),
        ]),
      ] : []),
      ...(input.content === "combined" ? [[]] : []),
      ...(input.content !== "learners" ? [
        staffHeaders,
        ...staff.map((person) => [person.name,person.employeeNumber ?? "",person.roleKey === "leader" ? "House leader" : "Member",...(includeSource ? [person.assignmentSource ?? ""] : []),...(includeLock ? [person.isLocked ? "Locked" : "Unlocked"] : [])]),
      ] : []),
    ];
    rows[0][1] = input.header.schoolName;
    rows[1][1] = input.header.formerName ? `(${input.header.formerName})` : "";
    rows[2][1] = input.header.contactLines.find((line) => line.key === "address")?.text ?? "";
    rows[3][1] = input.header.contactLines.filter((line) => line.key === "telephone" || line.key === "fax").map((line) => line.text).join("   ");
    rows[4][1] = input.header.contactLines.find((line) => line.key === "email")?.text ?? "";
    rows[5][1] = "";
    rows[0][metaStartColumn] = `${house.name}: House Roster`;
    rows[1][metaStartColumn] = `Academic year ${input.academicYear}`;
    rows[2][metaStartColumn] = `${learners.length} learners · ${staff.length} staff`;
    rows[3][metaStartColumn] = `Leader: ${leaders}`;
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const lastColumn = XLSX.utils.encode_col(columnCount - 1);
    const leftEnd = XLSX.utils.encode_col(Math.max(1, metaStartColumn - 1));
    const metaColumn = XLSX.utils.encode_col(metaStartColumn);
    sheet["!merges"] = [
      ...Array.from({ length: 6 }, (_, index) => XLSX.utils.decode_range(`B${index + 1}:${leftEnd}${index + 1}`)),
      ...Array.from({ length: 4 }, (_, index) => XLSX.utils.decode_range(`${metaColumn}${index + 1}:${lastColumn}${index + 1}`)),
    ];
    const widthMap = [6,28,...selectedColumns.map((column) => Math.max(8, Math.round(column.width / 4.2))), ...Array.from({ length: input.blankColumns }, () => 14)];
    sheet["!cols"] = Array.from({ length: columnCount }, (_, index) => ({ wch: widthMap[index] ?? 14 }));
    sheet["!rows"] = [{ hpt:22 },{ hpt:9 },{ hpt:9 },{ hpt:9 },{ hpt:9 },{ hpt:11 },{ hpt:21 },...rows.slice(7).map(() => ({ hpt:18 }))];
    sheet["!margins"] = { left:0.25,right:0.25,top:0.25,bottom:0.35,header:0.1,footer:0.1 };
    (sheet as XLSX.WorkSheet & { "!pageSetup"?: Record<string, unknown> })["!pageSetup"] = { orientation:"landscape",fitToWidth:1,fitToHeight:0,paperSize:9 };
    XLSX.utils.book_append_sheet(workbook,sheet,safeSheetName(house.name,used));
    chromeSheets.push({ tableHeaderRow:7,dataRowCount:Math.max(0,rows.length-7),columnCount,metaStartColumn });
  }
  const base = Buffer.from(XLSX.write(workbook,{type:"buffer",bookType:"xlsx",compression:true,cellStyles:true}));
  return applyOfficialDocumentXlsxChrome(base,input.header,logoBytes,chromeSheets);
}

export async function renderSportsHouseRosterPdf(input: SportsHouseRosterDocumentInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const resources = await createOfficialDocumentPdfResources(pdf,input.header);
  const { pageWidth, pageHeight, margin } = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
  const selectedColumns = selectedLearnerColumns(input);
  const preferredColumns: Array<readonly [string, number]> = [
    ["No.",24],["Learner",120],...selectedColumns.map((column) => [column.label, column.width] as const),
    ...Array.from({ length: input.blankColumns }, () => ["", 62] as const),
  ];
  const preferredWidth = preferredColumns.reduce((sum,entry)=>sum+entry[1],0);
  const availableWidth = pageWidth - margin * 2;
  const widthScale = availableWidth / preferredWidth;
  const columns = preferredColumns.map(([label, width]) => [label, width * widthScale] as const);
  const tableWidth = availableWidth;
  const drawSection = (section: SportsHouseRosterSection) => {
    let page = pdf.addPage([pageWidth,pageHeight]);
    const leader = section.staff.filter((p)=>p.roleKey==="leader").map((p)=>p.name).join(", ") || "Not assigned";
    let y = drawOfficialDocumentPdfHeader(page,input.header,resources,pageHeight-margin,{context:{title:`${section.house.name}: House Roster`,primaryContext:String(input.academicYear),secondaryContext:`House leader: ${leader}`,summary:`${section.learners.length} learners · ${section.staff.length} staff`}});
    const { regular,bold } = resources;
    y -= 13;
    const rowHeight=14;
    const headerRow=()=>{
      let x=margin;
      for(const [label,width] of columns){page.drawRectangle({x,y:y-rowHeight+3,width,height:rowHeight,borderWidth:.5,borderColor:rgb(.3,.3,.3)});page.drawText(label,{x:x+2,y:y-7,size:5.5,font:bold});x+=width;}
      y-=rowHeight;
    };
    if (input.content !== "staff") headerRow();
    if (input.content !== "staff") for(let i=0;i<section.learners.length;i+=1){
      if(y<margin+80){page=pdf.addPage([pageWidth,pageHeight]);y=drawOfficialDocumentPdfHeader(page,input.header,resources,pageHeight-margin,{context:{title:`${section.house.name}: House Roster`,primaryContext:String(input.academicYear),secondaryContext:`House leader: ${leader}`,summary:"Continued"}})-16;headerRow();}
      const learner=section.learners[i];
      const values=[String(i+1),learner.name,...selectedColumns.map((column) => column.value(learner)),...blankColumnLabels(input.blankColumns)];
      let x=margin;
      columns.forEach(([,width],ci)=>{page.drawRectangle({x,y:y-rowHeight+3,width,height:rowHeight,borderWidth:.4,borderColor:rgb(.45,.45,.45)});page.drawText(fitOfficialDocumentPdfText(regular,values[ci],5.2,width-4),{x:x+2,y:y-7,size:5.2,font:regular});x+=width;});
      y-=rowHeight;
    }
    if (input.content !== "learners") {
      y-=10;
      page.drawText("Staff",{x:margin,y,size:7,font:bold});y-=11;
    }
    if (input.content !== "learners") for(const person of section.staff){
      if(y<margin+20){page=pdf.addPage([pageWidth,pageHeight]);y=drawOfficialDocumentPdfHeader(page,input.header,resources,pageHeight-margin,{context:{title:`${section.house.name}: House Roster`,primaryContext:String(input.academicYear),secondaryContext:`House leader: ${leader}`,summary:"Staff continued"}})-16;}
      const extras = [
        input.learnerColumns.includes("source") ? person.assignmentSource ?? "Unknown source" : "",
        input.learnerColumns.includes("lock") ? (person.isLocked ? "Locked" : "Unlocked") : "",
      ].filter(Boolean);
      page.drawText(fitOfficialDocumentPdfText(regular,[person.name,person.roleKey==="leader"?"House leader":"Member",...extras].join(" · "),6.2,tableWidth),{x:margin,y,size:6.2,font:regular});y-=10;
    }
  };
  input.sections.forEach(drawSection);
  return pdf.save();
}
