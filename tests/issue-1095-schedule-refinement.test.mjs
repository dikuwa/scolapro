import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=(path)=>readFileSync(path,"utf8");
const server=source("src/features/reporting/server/academic-schedules.ts");
const layout=source("src/features/reporting/academic-schedule-column-layout.ts");
const printPage=source("src/app/reports/academic-schedules/print/page.tsx");
const pdf=source("src/features/reporting/server/render-academic-schedule-pdf.ts");
const xlsx=source("src/features/reporting/server/render-academic-schedule-xlsx.ts");
const xlsxChrome=source("src/features/documents/server/official-document-xlsx-chrome.ts");
const actions=source("src/components/documents/official-document-actions.tsx");
const filters=source("src/features/reporting/academic-schedule-filters.tsx");
const finalize=source("src/features/reporting/academic-schedule-finalize-form.tsx");

function compact(value){return value.replace(/\s+/g,"");}

test("all-results and promotion schedules share the governed identity-first column order",()=>{
  const normalized=compact(server);
  assert.ok(normalized.includes('["No.","AdmissionNumber","Student","DOB","HomeLanguage","Gender","Age","DaysAbsent","YearsinGrade","YearsinPhase",...subjects.flatMap'));
  assert.ok(normalized.includes('["No.","AdmissionNumber","Learner","DOB","HomeLanguage","Gender","Age","DaysAbsent","YearsinGrade","YearsinPhase","Average%","Rank",...(allTerms?["Cycle"]:[]),...subjects.map'));
  assert.ok(!normalized.includes('["No.","Learner","Sex","DOB"'));
});

test("schedule headings and cells use compact global alignment rules",()=>{
  assert.match(layout,/column === "Admission Number"\) return "vertical"/);
  assert.match(layout,/HORIZONTAL_METRIC_HEADINGS = new Set\(\["Support comments"\]\)/);
  assert.match(layout,/academicScheduleCellAlignment/);
  assert.match(layout,/academicScheduleColumnLabel/);
  assert.match(layout,/column === "Sex".*"Gender"/s);
  assert.match(layout,/"No\.".*"Admission Number".*"Gender".*"DOB".*"Birth Date"/s);
  assert.match(printPage,/center-heading/);
  assert.match(printPage,/center-cell/);
  assert.match(pdf,/academicScheduleCellAlignment/);
  assert.match(xlsx,/centeredHeaderColumns/);
  assert.match(xlsx,/centeredDataColumns/);
  assert.match(xlsxChrome,/centeredHeaderColumns/);
  assert.match(xlsxChrome,/centeredDataColumns/);
});

test("numeric and mark columns are deliberately narrow",()=>{
  assert.match(layout,/Age: 4\.5/);
  assert.match(layout,/"Days Absent": 5\.5/);
  assert.match(layout,/"Years in Grade": 5\.5/);
  assert.match(layout,/"Years in Phase": 5\.5/);
  assert.match(layout,/"Average %": 5\.5/);
  assert.match(layout,/"Overall %": 5\.5/);
  assert.match(layout,/Rank: 4\.5/);
  assert.match(layout,/column\.endsWith\(" Symbol"\) \? 5 : 6/);
});

test("schedule identity metadata remains self-identifying in print PDF and XLSX",()=>{
  for(const label of ["Grade:","Class:","Term:","Year:","Basis:"]){
    assert.match(pdf,new RegExp(label));
    assert.match(xlsx,new RegExp(label));
  }
  for(const label of [">Grade<",">Class<",">Term<",">Year<",">Basis<",">Generated<"]){
    assert.match(printPage,new RegExp(label));
  }
  assert.match(pdf,/Issued v\$\{lifecycle\.version\}/);
  assert.match(xlsx,/Issued version v/);
});

test("shared document actions and schedule generation expose in-flight feedback",()=>{
  assert.match(actions,/LoaderCircle/);
  assert.match(actions,/activeAction/);
  assert.match(actions,/Opening preview…/);
  assert.match(actions,/Preparing PDF…/);
  assert.match(actions,/Preparing Excel…/);
  assert.match(filters,/useFormStatus/);
  assert.match(filters,/Generating preview…/);
  assert.match(filters,/aria-busy=\{busy\}/);
  assert.match(finalize,/LoaderCircle/);
  assert.match(finalize,/Finalizing…/);
});
