import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const core = read("src/features/academics/academic-setup-core.tsx");
const action = read("src/components/ui/record-action-button.tsx");
const staff = read("src/features/staff/staff-access-manager.tsx");

test("Academic Setup expansion follows the full-width Staff Directory inline-panel pattern", () => {
  assert.match(core, /summary:\s*ReactNode/);
  assert.match(core, /data-academic-setup-row=\{panel\}/);
  assert.match(core, /className="grid min-w-0 gap-3"/);
  assert.doesNotMatch(core, /open && "xl:grid-cols/);
  assert.match(core, /data-academic-setup-panel=\{panel\}/);
  assert.match(staff, /col-span-full/);
});

test("timetable, calendar and HOD editors have stable linked disclosure IDs", () => {
  for (const id of ["workflow", "anchor", "hod"]) {
    assert.match(core, new RegExp(`panelId="academic-setup-panel-${id}"`));
    assert.match(core, new RegExp(`panel="${id}"`));
  }
  assert.match(core, /aria-controls=\{panelId\}/);
  assert.match(core, /disclosure/);
  assert.match(action, /aria-expanded=\{expanded\}/);
});

test("canonical record actions render a trailing, rotating chevron", () => {
  assert.match(action, /disclosure\?: boolean/);
  assert.match(action, /ChevronDown/);
  assert.match(action, /expanded && "rotate-180"/);
});
