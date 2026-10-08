import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registerWorkspace = readFileSync("src/features/attendance/register-teacher-workspace.tsx", "utf8");
const registerModel = readFileSync("src/features/attendance/server/register-teacher-document.ts", "utf8");
const registerRenderer = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");
const analysisModel = readFileSync("src/features/academics/server/academic-analysis.ts", "utf8");
const analysisPrint = readFileSync("src/app/academics/analysis/print/page.tsx", "utf8");
const analysisPdf = readFileSync("src/features/academics/server/render-academic-analysis-pdf.ts", "utf8");
const analysisXlsx = readFileSync("src/features/academics/server/render-academic-analysis-xlsx.ts", "utf8");
const schedulePrint = readFileSync("src/app/reports/academic-schedules/print/page.tsx", "utf8");
const schedulePdfRoute = readFileSync("src/app/reports/academic-schedules/export.pdf/route.ts", "utf8");
const scheduleXlsxRoute = readFileSync("src/app/reports/academic-schedules/export.xlsx/route.ts", "utf8");
const schedulePdf = readFileSync("src/features/reporting/server/render-academic-schedule-pdf.ts", "utf8");
const scheduleXlsx = readFileSync("src/features/reporting/server/render-academic-schedule-xlsx.ts", "utf8");

test("register week navigation displays the active week-ending date between chevrons", () => {
  assert.match(registerWorkspace, /Previous register week/);
  assert.match(registerWorkspace, /Week ending/);
  assert.match(registerWorkspace, /\{periodLabel\}/);
  assert.match(registerWorkspace, /Next register week/);
  assert.match(registerWorkspace, /addDays\(selectedFromWeek!, -7\)/);
  assert.match(registerWorkspace, /addDays\(selectedFromWeek!, 7\)/);
});

test("weekly register term totals balance against full governed term days", () => {
  assert.match(registerModel, /termTeachingDayCount/);
  assert.match(registerModel, /const termAttended = termPossible - termAbsent/);
  assert.match(registerModel, /termDays: termPossible/);
  assert.match(registerRenderer, /section\.termAttendanceTotal \+ section\.termAbsenceTotal/);
  assert.match(registerRenderer, /section\.termPossibleTotal/);
});

test("register bottom totals are strongly separated, bold and colour coded", () => {
  assert.match(registerRenderer, /border-top:3px solid var\(--register-red\)/);
  assert.match(registerRenderer, /attendance-summary-row/);
  assert.match(registerRenderer, /absence-summary-row/);
  assert.match(registerRenderer, /possible-summary-row/);
  assert.match(registerRenderer, /font-weight:900/);
});

test("academic analysis print, PDF and XLSX identify grade and class scope", () => {
  assert.match(analysisModel, /documentScope/);
  assert.match(analysisModel, /gradeLabel/);
  assert.match(analysisModel, /classLabel/);
  for (const source of [analysisPrint, analysisPdf, analysisXlsx]) {
    assert.match(source, /Grade\/Class:/);
    assert.match(source, /documentScope\.gradeLabel/);
    assert.match(source, /documentScope\.classLabel/);
  }
});

test("academic schedules preserve singular or multi-class scope and print it prominently", () => {
  assert.match(schedulePrint, /params\.classes\?\?params\.class/);
  assert.match(schedulePdfRoute, /get\("classes"\) \?\? url\.searchParams\.get\("class"\)/);
  assert.match(scheduleXlsxRoute, /get\("classes"\)\?\?url\.searchParams\.get\("class"\)/);
  assert.match(schedulePrint, />Grade<.*>Class</s);
  assert.match(schedulePdf, /Grade:.*Class:/s);
  assert.match(schedulePdf, /payload\.title.*classScope/s);
  assert.match(scheduleXlsx, /Grade:.*Class:/s);
});
