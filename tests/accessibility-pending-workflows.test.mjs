import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("affected workflows expose labelled controls and pending feedback", async () => {
  const [leave, admissions, absence, guardian, progression] = await Promise.all([
    source("src/features/staff/leave/staff-leave-workspace.tsx"),
    source("src/features/admissions/admission-candidate-form.tsx"),
    source("src/features/attendance/absence-review-workspace.tsx"),
    source("src/features/parents/absence-review-list.tsx"),
    source("src/features/learners/learner-exit-operations.tsx"),
  ]);

  assert.match(leave, /htmlFor=\{`leave-evidence-\$\{requestId\}`\}/);
  assert.match(leave, /Choose evidence file/);
  assert.match(admissions, /useFormStatus/);
  assert.match(admissions, /Saving candidate…/);
  assert.match(admissions, /aria-busy=\{pending\}/);
  assert.match(absence, /aria-label="Clear absence filters"/);
  assert.match(absence, /Updating absence results…/);
  assert.match(guardian, /aria-label="Clear absence notice search"/);
  assert.match(guardian, /aria-pressed=\{statusFilter === s\}/);
  assert.match(progression, /CheckboxField/);
  assert.match(progression, /locked outcome/);
});

test("affected surfaces retain responsive and theme-aware source contracts", async () => {
  const [leave, admissions, absence, guardian, progression] = await Promise.all([
    source("src/features/staff/leave/staff-leave-workspace.tsx"),
    source("src/features/admissions/admission-candidate-form.tsx"),
    source("src/features/attendance/absence-review-workspace.tsx"),
    source("src/features/parents/absence-review-list.tsx"),
    source("src/features/learners/learner-exit-operations.tsx"),
  ]);
  const combined = [leave, admissions, absence, guardian, progression].join("\n");

  for (const widthContract of ["sm:", "lg:", "xl:"]) assert.match(combined, new RegExp(widthContract.replace(":", "\\:")));
  assert.match(combined, /bg-surface|bg-surface-muted/);
  assert.match(combined, /border-border-subtle/);
  assert.doesNotMatch(combined, /bg-(?:blue|red|green|purple)-\d+/);
});
