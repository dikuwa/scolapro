import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const analysis = readFileSync("src/app/academics/analysis/page.tsx", "utf8");
const demand = readFileSync("src/features/timetable/curriculum-demand-matrix.tsx", "utf8");
const inventory = readFileSync("src/features/room-inventory/room-inventory-workspace.tsx", "utf8");
const teachingFiles = readFileSync("src/features/teaching/components/operational-teaching-files.tsx", "utf8");
const inspection = readFileSync("src/app/api/teaching/subject-file/inspection-pack/route.ts", "utf8");

test("academic analysis stays inside the authenticated application shell", () => {
  assert.match(analysis, /import \{ AppShell \} from "@\/components\/shell\/app-shell";/);
  assert.match(analysis, /<AppShell>/);
  assert.match(analysis, /<Link href="\/assessment"/);
  assert.doesNotMatch(analysis, /<main className="scolapro-content-width mx-auto/);
});

test("curriculum demand summary uses balanced responsive conceptual columns", () => {
  assert.match(demand, /md:grid-cols-2 lg:grid-cols-3/);
  assert.match(demand, /md:col-span-2 lg:col-span-1/);
  assert.equal((demand.match(/2xl:grid-cols-4/g) ?? []).length, 2);
  assert.doesNotMatch(demand, /sm:min-w-\[34rem\]/);
  assert.doesNotMatch(demand, /sm:max-w-\[44rem\]/);
});

test("room inventory keeps the roster inside its own scroll region", () => {
  assert.match(inventory, /aria-label="Room inventory roster"/);
  assert.match(inventory, /max-h-\[min\(64dvh,46rem\)\]/);
  assert.match(inventory, /overflow-y-auto/);
  assert.match(inventory, /overscroll-contain/);
});

test("Subject File uses a module-style app link instead of a generic text control", () => {
  assert.match(teachingFiles, /href="\/teaching\/subject-file"/);
  assert.match(teachingFiles, /<FolderKanban/);
  assert.match(teachingFiles, /Open shared subject dossier/);
  assert.match(teachingFiles, /<ArrowUpRight/);
  assert.doesNotMatch(teachingFiles, />\s*Open Subject File\s*<\/Link>/);
});

test("Subject File inspection pack reuses governed official document chrome", () => {
  assert.match(inspection, /getLiveSchoolDocumentHeader/);
  assert.match(inspection, /renderOfficialDocumentHtmlHeader/);
  assert.match(inspection, /OFFICIAL_DOCUMENT_A4_PAGE_RULE/);
  assert.match(inspection, /OFFICIAL_DOCUMENT_FRAME_RULE/);
  assert.match(inspection, /OFFICIAL_DOCUMENT_HTML_HEADER_RULE/);
  assert.match(inspection, /OFFICIAL_DOCUMENT_PRINT_RULE/);
  assert.match(inspection, /renderOfficialDocumentHtmlFooter/);
  assert.match(inspection, /max-width:210mm/);
  assert.match(inspection, /Subject File Inspection Pack/);
  assert.doesNotMatch(inspection, /font-family:Arial/);
});
