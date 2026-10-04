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

export type SportsHouseRosterDocumentInput = {
  header: OfficialDocumentHeaderModel;
  schoolName: string;
  academicYear: number;
  sections: SportsHouseRosterSection[];
  generatedAt: string;
  content: "learners" | "staff" | "combined";
  groupBy: "none" | "age_group" | "sex" | "grade" | "class";
  blankColumns: number;
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
  const blankHeaders = blankColumnLabels(input.blankColumns).map(() => "<th></th>").join("");
  const blankCells = blankColumnLabels(input.blankColumns).map(() => "<td></td>").join("");
  const sectionMarkup = input.sections.map(({ house, learners, staff }) => {
    const leaders = staff.filter((person) => person.roleKey === "leader").map((person) => person.name);
    let learnerIndex = 0;
    const learnerRows = groupedLearners(learners,input.groupBy).map((group) =>
      `${group.label ? `<tr class="group-row"><td colspan="${9 + input.blankColumns}">${escapeOfficialDocumentHtml(group.label)}</td></tr>` : ""}${group.rows.map((learner) => {
        learnerIndex += 1;
        return `<tr>
      <td>${learnerIndex}</td><td>${escapeOfficialDocumentHtml(learner.name)}</td>
      <td>${escapeOfficialDocumentHtml(learner.gradeName)}</td><td>${escapeOfficialDocumentHtml(learner.registerClassName)}</td>
      <td>${escapeOfficialDocumentHtml(sexLabel(learner.sex))}</td><td>${escapeOfficialDocumentHtml(learner.ageOnReferenceDate)}</td>
      <td>${escapeOfficialDocumentHtml(learner.ageGroupLabel ?? "Unresolved")}</td>
      <td>${escapeOfficialDocumentHtml(learner.assignmentSource)}</td><td>${learner.isLocked ? "Locked" : "Unlocked"}</td>${blankCells}
    </tr>`;
      }).join("")}`
    ).join("");
    const staffRows = staff.map((person) => `<tr><td>${escapeOfficialDocumentHtml(person.name)}</td><td>${escapeOfficialDocumentHtml(person.employeeNumber)}</td><td>${person.roleKey === "leader" ? "House leader" : "Member"}</td><td>${escapeOfficialDocumentHtml(person.assignmentSource)}</td><td>${person.isLocked ? "Locked" : "Unlocked"}</td></tr>`).join("");
    return `<section class="house-block">
      <h2>${escapeOfficialDocumentHtml(house.name)}</h2>
      <p class="house-summary">Leader: ${escapeOfficialDocumentHtml(leaders.join(", ") || "Not assigned")} · ${learners.length} learners · ${staff.length} staff</p>
      ${input.content !== "staff" ? `<table><thead><tr><th>No.</th><th>Learner</th><th>Grade</th><th>Class</th><th>Sex</th><th>Age</th><th>Age group</th><th>Source</th><th>Lock</th>${blankHeaders}</tr></thead><tbody>${learnerRows || `<tr><td colspan="${9 + input.blankColumns}">No learners assigned.</td></tr>`}</tbody></table>` : ""}
      ${input.content !== "learners" ? `<h3>Staff</h3><table><thead><tr><th>Staff member</th><th>Employee No.</th><th>Role</th><th>Source</th><th>Lock</th></tr></thead><tbody>${staffRows || '<tr><td colspan="5">No staff assigned.</td></tr>'}</tbody></table>` : ""}
    </section>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeOfficialDocumentHtml(input.schoolName)} - House Rosters ${input.academicYear}</title>
<style>
${OFFICIAL_DOCUMENT_A4_PAGE_RULE}
*{box-sizing:border-box}:root{--ink:#151515;--line:#4a4a4a;--muted:#666}
html,body{margin:0;padding:0;background:#fff;color:var(--ink)}body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:8px;line-height:1.25}
.report{padding:6mm 7mm 5mm}${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
.house-block{margin-top:10px;break-inside:auto}.house-block h2{font-size:12px;margin:0 0 2px}.house-summary{margin:0 0 6px;color:var(--muted)}
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
  for (const { house, learners, staff } of input.sections) {
    const leaders = staff.filter((person) => person.roleKey === "leader").map((person) => person.name).join(", ") || "Not assigned";
    const baseLearnerHeaders = ["No.","Learner","Admission No.","Grade","Register Class","Sex","Age","Age Group","Source","Lock"];
    const learnerHeaders = [...baseLearnerHeaders, ...blankColumnLabels(input.blankColumns)];
    const staffHeaders = ["Staff member","Employee No.","Role","Source","Lock"];
    const columnCount = Math.max(input.content === "staff" ? staffHeaders.length : learnerHeaders.length, 6);
    const metaStartColumn = Math.max(3, Math.floor(columnCount * 0.58));
    const blankRow = () => Array.from({ length: columnCount }, () => "");
    const rows: Array<Array<string | number>> = [
      blankRow(), blankRow(), blankRow(), blankRow(), blankRow(), blankRow(),
      ...(input.content !== "staff" ? [
        learnerHeaders,
        ...groupedLearners(learners,input.groupBy).flatMap((group) => [
          ...(group.label ? [[group.label]] : []),
          ...group.rows.map((learner,index) => [index+1,learner.name,learner.admissionNumber ?? "",learner.gradeName ?? "",learner.registerClassName ?? "",sexLabel(learner.sex),learner.ageOnReferenceDate ?? "",learner.ageGroupLabel ?? "Unresolved",learner.assignmentSource ?? "",learner.isLocked ? "Locked" : "Unlocked", ...blankColumnLabels(input.blankColumns)]),
        ]),
      ] : []),
      ...(input.content === "combined" ? [[]] : []),
      ...(input.content !== "learners" ? [
        staffHeaders,
        ...staff.map((person) => [person.name,person.employeeNumber ?? "",person.roleKey === "leader" ? "House leader" : "Member",person.assignmentSource ?? "",person.isLocked ? "Locked" : "Unlocked"]),
      ] : []),
    ];
    rows[0][1] = input.header.schoolName;
    rows[1][1] = input.header.formerName ? `(${input.header.formerName})` : "";
    rows[2][1] = input.header.contactLines.find((line) => line.key === "address")?.text ?? "";
    rows[3][1] = input.header.contactLines.filter((line) => line.key === "telephone" || line.key === "fax").map((line) => line.text).join("   ");
    rows[4][1] = input.header.contactLines.find((line) => line.key === "email")?.text ?? "";
    rows[5][1] = `Leader: ${leaders}`;
    rows[0][metaStartColumn] = `${house.name}: House Roster`;
    rows[1][metaStartColumn] = `Academic year ${input.academicYear}`;
    rows[2][metaStartColumn] = `${learners.length} learners · ${staff.length} staff`;
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const lastColumn = XLSX.utils.encode_col(columnCount - 1);
    const leftEnd = XLSX.utils.encode_col(Math.max(1, metaStartColumn - 1));
    const metaColumn = XLSX.utils.encode_col(metaStartColumn);
    sheet["!merges"] = [
      ...Array.from({ length: 6 }, (_, index) => XLSX.utils.decode_range(`B${index + 1}:${leftEnd}${index + 1}`)),
      ...Array.from({ length: 3 }, (_, index) => XLSX.utils.decode_range(`${metaColumn}${index + 1}:${lastColumn}${index + 1}`)),
    ];
    sheet["!cols"] = Array.from({ length: columnCount }, (_, index) => ({ wch: [6,28,16,14,16,8,8,13,14,10][index] ?? 14 }));
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
  const preferredColumns = [
    ["No.",24],["Learner",120],["Grade",50],["Class",48],["Sex",28],["Age",28],["Age group",55],["Source",60],["Lock",48],
    ...Array.from({ length: input.blankColumns }, () => ["", 62] as const),
  ] as const;
  const preferredWidth = preferredColumns.reduce((sum,entry)=>sum+entry[1],0);
  const availableWidth = pageWidth - margin * 2;
  const widthScale = availableWidth / preferredWidth;
  const columns = preferredColumns.map(([label, width]) => [label, width * widthScale] as const);
  const tableWidth = availableWidth;
  const drawSection = (section: SportsHouseRosterSection) => {
    let page = pdf.addPage([pageWidth,pageHeight]);
    let y = drawOfficialDocumentPdfHeader(page,input.header,resources,pageHeight-margin,{context:{title:`${section.house.name}: House Roster`,primaryContext:String(input.academicYear),summary:`${section.learners.length} learners · ${section.staff.length} staff`}});
    const { regular,bold } = resources;
    y -= 13;
    const leader = section.staff.filter((p)=>p.roleKey==="leader").map((p)=>p.name).join(", ") || "Not assigned";
    page.drawText(fitOfficialDocumentPdfText(regular,`House leader: ${leader}`,7,tableWidth),{x:margin,y,size:7,font:regular,color:rgb(.15,.15,.15)});
    y -= 12;
    const rowHeight=14;
    const headerRow=()=>{
      let x=margin;
      for(const [label,width] of columns){page.drawRectangle({x,y:y-rowHeight+3,width,height:rowHeight,borderWidth:.5,borderColor:rgb(.3,.3,.3)});page.drawText(label,{x:x+2,y:y-7,size:5.5,font:bold});x+=width;}
      y-=rowHeight;
    };
    if (input.content !== "staff") headerRow();
    if (input.content !== "staff") for(let i=0;i<section.learners.length;i+=1){
      if(y<margin+80){page=pdf.addPage([pageWidth,pageHeight]);y=drawOfficialDocumentPdfHeader(page,input.header,resources,pageHeight-margin,{context:{title:`${section.house.name}: House Roster`,primaryContext:String(input.academicYear),summary:"Continued"}})-16;headerRow();}
      const learner=section.learners[i];
      const values=[String(i+1),learner.name,learner.gradeName??"",learner.registerClassName??"",sexLabel(learner.sex),learner.ageOnReferenceDate===null?"":String(learner.ageOnReferenceDate),learner.ageGroupLabel??"Unresolved",learner.assignmentSource??"",learner.isLocked?"Locked":"Unlocked",...blankColumnLabels(input.blankColumns)];
      let x=margin;
      columns.forEach(([,width],ci)=>{page.drawRectangle({x,y:y-rowHeight+3,width,height:rowHeight,borderWidth:.4,borderColor:rgb(.45,.45,.45)});page.drawText(fitOfficialDocumentPdfText(regular,values[ci],5.2,width-4),{x:x+2,y:y-7,size:5.2,font:regular});x+=width;});
      y-=rowHeight;
    }
    if (input.content !== "learners") {
      y-=10;
      page.drawText("Staff",{x:margin,y,size:7,font:bold});y-=11;
    }
    if (input.content !== "learners") for(const person of section.staff){
      if(y<margin+20){page=pdf.addPage([pageWidth,pageHeight]);y=drawOfficialDocumentPdfHeader(page,input.header,resources,pageHeight-margin,{context:{title:`${section.house.name}: House Roster`,primaryContext:String(input.academicYear),summary:"Staff continued"}})-16;}
      page.drawText(fitOfficialDocumentPdfText(regular,`${person.name} · ${person.roleKey==="leader"?"House leader":"Member"} · ${person.assignmentSource??"Unknown source"} · ${person.isLocked?"Locked":"Unlocked"}`,6.2,tableWidth),{x:margin,y,size:6.2,font:regular});y-=10;
    }
  };
  input.sections.forEach(drawSection);
  return pdf.save();
}
