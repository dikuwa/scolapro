import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("src/features/attendance/server/render-register-teacher-html.ts", "utf8");
const pdf = readFileSync("src/features/attendance/server/render-register-teacher-pdf.ts", "utf8");

test("register preview sheet fits and centers within the viewport", () => {
  assert.match(html, /\.sheet \{ width:100%; max-width:none; margin-inline:auto/);
  assert.match(html, /@media print/);
  assert.match(html, /size:A3 landscape/);
});

test("balance uses borderless inline titles instead of boxed uppercase cells", () => {
  assert.match(html, /class="balance-strip" aria-label="Register attendance balance"/);
  assert.match(html, /\.balance-strip \{ display:flex/);
  assert.doesNotMatch(html, /\.balance-item \{/);
  assert.doesNotMatch(html, /text-transform:uppercase/);
  for (const label of ["Attendance", "Absence", "Possible", "Balance:"]) {
    assert.ok(html.includes(label));
    assert.ok(pdf.includes(label));
  }
});

test("PDF mirrors HTML legend and metadata ordering", () => {
  assert.match(html, /<sup class="absence-reason-mark">✓<\/sup>/);
  assert.match(pdf, /const legendY = y - 7/);
  assert.match(pdf, /REGISTER CLASS:/);
  assert.match(pdf, /REGISTER TEACHER:/);
  assert.match(pdf, /"Tot\."/);
  assert.doesNotMatch(pdf, /drawCell\(page, resources\.bold, "WEEK"/);
});
