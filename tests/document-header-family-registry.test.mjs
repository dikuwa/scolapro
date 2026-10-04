import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const registry = read("src/features/documents/server/official-document-header.ts");
const schedulePrint = read("src/app/reports/academic-schedules/print/page.tsx");
const scheduleExport = read("src/app/reports/academic-schedules/export.xlsx/route.ts");
const scheduleActions = read("src/features/reporting/server/academic-schedule-actions.ts");
const reportHtml = read("src/features/reporting/server/render-report-card-html-with-school-font.ts");
const reportPdf = read("src/features/reporting/server/render-report-card-pdf-with-school-font.ts");
const classList = read("src/app/api/official-documents/class-list/route.ts");
const sports = read("src/app/api/official-documents/sports-house-roster/route.ts");
const room = read("src/app/api/official-documents/room-inventory/route.ts");
const attendance = read("src/app/api/official-documents/attendance-summary/route.ts");
const teaching = read("src/app/api/official-documents/teaching-pack/route.ts");
const transfer = read("src/features/transfers/server/render-learner-transfer-form.ts");

test("document header registry has exactly governed official, school and prescribed families", () => {
  assert.match(registry, /OfficialDocumentHeaderFamily =/);
  assert.match(registry, /"official_external"/);
  assert.match(registry, /"school_document"/);
  assert.match(registry, /"prescribed_statutory"/);

  for (const type of [
    "admission_application",
    "report_card",
    "academic_schedule",
    "external_correspondence",
    "crc_outbound_document",
  ]) {
    assert.match(registry, new RegExp(`case "${type}"`));
  }

  for (const type of [
    "class_list",
    "sports_house_roster",
    "room_inventory",
    "attendance_summary",
    "teaching_print_pack",
    "teaching_plan",
    "subject_file_inspection_pack",
    "academic_analysis",
  ]) {
    assert.match(registry, new RegExp(`case "${type}"`));
  }

  assert.match(registry, /case "learner_transfer_form":[\s\S]*return "prescribed_statutory"/);
});

test("outbound generic documents resolve through the official external family", () => {
  assert.match(reportHtml, /officialDocumentHeaderModeForType\("report_card"\)/);
  assert.match(reportPdf, /officialDocumentHeaderModeForType\("report_card"\)/);
  assert.match(schedulePrint, /officialDocumentHeaderModeForType\("academic_schedule"\)/);
  assert.match(scheduleExport, /officialDocumentHeaderModeForType\("academic_schedule"\)/);
  assert.match(scheduleActions, /officialDocumentHeaderModeForType\("academic_schedule"\)/);
});

test("academic schedule print uses the shared header renderer rather than one-off school identity markup", () => {
  assert.match(schedulePrint, /renderOfficialDocumentHtmlHeader\(header\)/);
  assert.match(schedulePrint, /OFFICIAL_DOCUMENT_HTML_HEADER_RULE/);
  assert.doesNotMatch(schedulePrint, /Republic of Namibia · Official school academic record/);
  assert.doesNotMatch(schedulePrint, /header\.logoUrl\?<img/);
});

test("school operational exports stay on the school-document family", () => {
  assert.match(classList, /officialDocumentHeaderModeForType\("class_list"\)/);
  assert.match(sports, /officialDocumentHeaderModeForType\("sports_house_roster"\)/);
  assert.match(room, /officialDocumentHeaderModeForType\("room_inventory"\)/);
  assert.match(attendance, /officialDocumentHeaderModeForType\("attendance_summary"\)/);
  assert.match(teaching, /officialDocumentHeaderModeForType\("teaching_print_pack"\)/);
});

test("prescribed transfer form remains source-faithful and explicitly classified", () => {
  assert.match(transfer, /TRANSFER_FORM_TEMPLATE_CONTRACT = "namibia-prescribed-transfer-form"/);
  assert.match(transfer, /officialDocumentHeaderModeForType\("learner_transfer_form"\)/);
  assert.match(transfer, /MINISTRY OF BASIC EDUCATION AND CULTURE/);
  assert.match(transfer, /7-1\/0093/);
});
