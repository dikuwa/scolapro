import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const globals = read("src/app/globals.css");
const button = read("src/components/ui/button.tsx");
const recordAction = read("src/components/ui/record-action-button.tsx");
const academicCore = read("src/features/academics/academic-setup-core.tsx");
const academicForms = read("src/features/academics/structure-forms.tsx");
const academicHodScope = read("src/features/academics/hod-scope-configuration.tsx");
const academicPage = read("src/app/school/setup/page.tsx");
const directory = read("src/features/school-directory/directory-contact-settings-panel.tsx");
const statutory = read("src/features/statutory/school-statutory-profile-panel.tsx");
const reportSettings = read("src/features/reporting/report-card-settings-panel.tsx");
const finance = read("src/features/finance/finance-workspace.tsx");
const calendar = read("src/features/calendar/operational-calendar-manager.tsx");
const roomInventory = read("src/features/room-inventory/room-inventory-workspace.tsx");
const sportsHouses = read("src/features/sports-houses/sports-houses-workspace.tsx");
const lessonPreparation = read("src/features/academics/lesson-preparation-workspace.tsx");

test("global section descriptions stay readable and shared CTAs never wrap labels", () => {
  assert.match(globals, /\.scolapro-section-description \{[^}]*max-width: 64ch/);
  assert.match(globals, /button\.scolapro-cta,[\s\S]*\.scolapro-cta\.inline-flex \{[\s\S]*white-space: nowrap/);
  assert.doesNotMatch(globals, /\.scolapro-cta \{[^}]*white-space: nowrap/);
  assert.match(button, /whitespace-nowrap/);
});

test("shared record actions own edit and manage icon semantics", () => {
  assert.match(recordAction, /actionKind\?: "edit" \| "manage"/);
  assert.match(recordAction, /actionKind === "edit" \? Pencil/);
  assert.match(recordAction, /actionKind === "manage" \? Settings2/);
});

test("core academic setup keeps exactly two workflow cards whose editors replace the summary in place", () => {
  assert.match(academicCore, /grid gap-5 lg:grid-cols-2 lg:items-start/);
  assert.match(academicCore, /function CoreSetupCard/);
  assert.match(academicCore, /title="Timetable workflow"/);
  assert.match(academicCore, /title="Calendar anchor"/);
  assert.doesNotMatch(academicCore, /title="HOD teaching scope"/);
  assert.match(academicCore, /data-core-setup-content=\{active \? "editor" : "summary"\}/);
  assert.equal((academicCore.match(/active \? editor : summary/g) ?? []).length, 1);
  assert.match(academicCore, /actionKind="edit"/);
  assert.match(academicCore, />\s*Active\s*</);
  // No second side-by-side editing column and no third workflow card.
  assert.doesNotMatch(academicCore, /xl:grid-cols-\[minmax/);
  assert.doesNotMatch(academicCore, /function CoreSetupRow/);
  assert.doesNotMatch(academicCore, /lg:grid-cols-3/);
  // HOD scope editing lives in its own section behind an explicit manage action.
  assert.match(academicHodScope, /actionKind=\{open \? undefined : "manage"\}/);
});

test("academic structure uses one tabbed Grade & Class card with right-anchored actions", () => {
  assert.match(academicForms, /role="tablist"/);
  assert.match(academicForms, /role="tabpanel"/);
  assert.match(academicForms, /aria-selected=\{tab === value\}/);
  assert.ok((academicForms.match(/flex justify-end/g) ?? []).length >= 2);
  assert.doesNotMatch(academicForms, /lg:grid-cols-2 lg:items-start/);
  assert.match(academicPage, /canManageAcademicStructure \? "xl:grid-cols-2"/);
});

test("matching school settings cards use shared edit and manage action semantics", () => {
  for (const source of [directory, statutory, reportSettings, finance]) {
    assert.match(source, /RecordActionButton/);
  }
  assert.match(directory, /actionKind=\{open \? undefined : "edit"\}/);
  assert.match(statutory, /actionKind=\{open \? undefined : "edit"\}/);
  assert.match(reportSettings, /actionKind=\{documentOpen \? undefined : "edit"\}/);
  assert.match(reportSettings, /actionKind=\{subjectsOpen \? undefined : "manage"\}/);
  assert.match(finance, /actionKind=\{open \? undefined : "edit"\}/);
});

test("other equivalent edit and manage surfaces use recognizable icons", () => {
  assert.match(calendar, /<RecordActionButton icon=\{Pencil\}/);
  assert.match(roomInventory, /<Settings2 className="size-4"/);
  assert.ok((sportsHouses.match(/<Settings2 className="size-4"/g) ?? []).length >= 2);
});


test("long shared CTA labels stay single-line without forcing dense forms into narrow columns", () => {
  assert.match(lessonPreparation, /xl:grid-cols-\[repeat\(3,minmax\(0,1fr\)\)_auto\]/);
  assert.match(lessonPreparation, /md:col-span-2 xl:col-span-1/);
  assert.doesNotMatch(lessonPreparation, /md:grid-cols-2 lg:grid-cols-4/);
});
