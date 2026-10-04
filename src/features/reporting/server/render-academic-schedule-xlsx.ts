import "server-only";

import * as XLSX from "xlsx";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import type { AcademicSchedulePayload } from "@/features/reporting/server/academic-schedules";

export type AcademicScheduleIssuedLifecycle = {
  version: number;
  status: "finalized" | "superseded";
  finalizedAt: string;
  supersessionReason: string | null;
};

export function renderAcademicScheduleXlsx(
  payload: AcademicSchedulePayload,
  header: OfficialDocumentHeaderModel,
  lifecycle?: AcademicScheduleIssuedLifecycle,
): Buffer {
  const headingRows: Array<Array<string>> = [
    ["REPUBLIC OF NAMIBIA · OFFICIAL SCHOOL ACADEMIC RECORD"],
    [header.schoolName],
    ["EMIS " + (header.schoolEmisNumber || "Not recorded")],
    [header.contactLines.map((line) => line.text).join(" · ")],
    [payload.title],
    ["Academic year " + payload.academicYear + " · " + payload.periodLabel + " · " + (payload.grade || "Not recorded") + " · " + ((payload.classNames??[]).join(", ") || "All classes in grade") + " · Basis: " + payload.basis.toUpperCase()],
  ];
  if (lifecycle) {
    headingRows.push(["Issued version v" + lifecycle.version + " · " + lifecycle.status.toUpperCase()]);
    headingRows.push(["Finalized " + new Date(lifecycle.finalizedAt).toLocaleString("en-NA")]);
    if (lifecycle.status === "superseded") {
      headingRows.push(["SUPERSEDED — retained historical version; not the current official schedule."]);
      if (lifecycle.supersessionReason) headingRows.push(["Correction reason: " + lifecycle.supersessionReason]);
    }
  } else {
    headingRows.push(["Generated " + payload.generatedAt]);
  }
  headingRows.push([]);
  headingRows.push(payload.columns);

  const sheet = XLSX.utils.aoa_to_sheet(headingRows);
  if (payload.rows.length) {
    XLSX.utils.sheet_add_json(sheet,payload.rows,{
      origin:"A" + (headingRows.length + 1),
      skipHeader:true,
      header:payload.columns,
    });
  }
  let nextRow=headingRows.length+payload.rows.length+1;
  for(const footer of payload.footerRows??[]){
    XLSX.utils.sheet_add_json(sheet,[footer],{origin:"A"+nextRow,skipHeader:true,header:payload.columns});
    nextRow+=1;
  }
  nextRow+=2;
  if(payload.scheduleType!=="term_schedule"){
    XLSX.utils.sheet_add_aoa(sheet,[["CERTIFICATION"],["Class Teacher","Signature","Name","Date"],["Principal","Signature","Name","Date"],["Regional Director","Signature","Name","Date"],[],["OUTCOME ANALYSIS"],["Outcome","Female","Male","Total"],...(payload.outcomeAnalysis??[]).map((row)=>[row.outcome,row.female,row.male,row.total])],{origin:"A"+nextRow});
  }else{
    XLSX.utils.sheet_add_aoa(sheet,[["Name","Signature","Date","School Stamp"],["* Adjustment","_ Mark below governed pass mark"]],{origin:"A"+nextRow});
  }
  sheet["!cols"] = payload.columns.map((column) => ({wch:Math.min(32,Math.max(12,column.length+2))}));
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,sheet,payload.title.slice(0,31));
  return Buffer.from(XLSX.write(workbook,{type:"buffer",bookType:"xlsx",compression:true}));
}

export function academicScheduleXlsxFilename(
  payload: AcademicSchedulePayload,
  lifecycle?: AcademicScheduleIssuedLifecycle,
) {
  const issued=lifecycle?"-v"+lifecycle.version+"-"+lifecycle.status:"";
  return payload.scheduleType + "-" + payload.academicYear + "-" + ((payload.period??(payload.scheduleType==="promotion_all_terms"?"all_terms":"term"))==="all_terms"?"all-terms":"term-"+payload.termNumber) + "-" + payload.basis + issued + ".xlsx";
}
