import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const dynamicRoutes = [
  "src/app/attendance/lesson/[slotId]/page.tsx",
  "src/app/learners/[id]/cumulative-record/page.tsx",
  "src/app/learners/[id]/page.tsx",
  "src/app/teaching/reviews/[id]/page.tsx",
  "src/app/teaching/reviews/professional-files/[id]/page.tsx",
  "src/features/teaching/curriculum-access-workspace.tsx",
];

test("dynamic internal detail routes use the shared application back control", async () => {
  for (const route of dynamicRoutes) {
    const source = await read(route);
    assert.match(source, /import \{ AppBackLink \} from "@\/components\/navigation\/app-back-link"/);
    assert.match(source, /<AppBackLink href=/);
    assert.doesNotMatch(source, /ArrowLeft/);
  }
});

test("official document pages reuse the application back control", async () => {
  const [applicationControl, documentControl] = await Promise.all([
    read("src/components/navigation/app-back-link.tsx"),
    read("src/components/documents/document-back-link.tsx"),
  ]);
  assert.match(applicationControl, /scolapro-cta/);
  assert.match(applicationControl, /ArrowLeft/);
  assert.match(documentControl, /AppBackLink/);
});

test("the containment batch does not add global scroll hijacking", async () => {
  const sources = await Promise.all([
    read("src/features/reporting/paged-report-card-management.tsx"),
    read("src/features/reporting/report-card-settings-panel.tsx"),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /document\.body\.style\.overflow|window\.onscroll|addEventListener\(["']scroll/);
    assert.match(source, /overscroll-contain/);
    assert.match(source, /overflow-y-auto/);
  }
});
