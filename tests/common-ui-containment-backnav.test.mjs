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
];

test("dynamic internal detail routes retain the shared back-arrow pattern", async () => {
  for (const route of dynamicRoutes) {
    const source = await read(route);
    assert.match(source, /import \{[^}]*ArrowLeft/);
    assert.match(source, /<Link href=(?:\{)?(?:"[^"]+"|`[^`]+`)(?:\})?[^>]*>[\s\S]*ArrowLeft/);
  }
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
