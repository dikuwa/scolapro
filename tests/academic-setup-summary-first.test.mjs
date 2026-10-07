import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/school/setup/page.tsx", "utf8");
const core = readFileSync("src/features/academics/academic-setup-core.tsx", "utf8");
const forms = readFileSync("src/features/academics/structure-forms.tsx", "utf8");
const rooms = readFileSync("src/features/timetable/room-management.tsx", "utf8");

test("academic setup keeps existing content but leads with compact summaries", () => {
  assert.match(page, /AcademicSetupCore/);
  assert.match(core, /Core academic setup/);
  assert.match(core, /Timetable workflow/);
  assert.match(core, /Calendar anchor/);
  assert.match(core, /HOD teaching scope/);
  assert.match(page, /Current register structure/);
  assert.match(page, /RoomManagement/);
});

test("configuration forms open only after an explicit user action", () => {
  assert.match(core, /useState<ActivePanel>\(null\)/);
  assert.match(core, /activePanel === "workflow"/);
  assert.match(core, /activePanel === "anchor"/);
  assert.match(core, /activePanel === "hod"/);
  assert.match(forms, /useState<"grade" \| "class" \| null>\(null\)/);
  assert.match(forms, /openPanel === "grade"/);
  assert.match(forms, /openPanel === "class"/);
});

test("academic setup does not invent activity or secondary setup surfaces", () => {
  const combined = `${page}\n${core}\n${forms}`;
  assert.doesNotMatch(combined, /Recent changes/i);
  assert.doesNotMatch(combined, /Additional setup options/i);
  assert.doesNotMatch(combined, /View change log/i);
  assert.doesNotMatch(combined, /Audit log/i);
});

test("room management remains complete but bounded for scanning", () => {
  assert.match(rooms, /max-h-\[33rem\]/);
  assert.match(rooms, /overflow-y-auto/);
  assert.match(rooms, /Add room/);
  assert.match(rooms, /Pencil/);
  assert.match(rooms, /Trash2/);
});

test("current register structure stays bounded and scrollable like room management", () => {
  assert.match(page, /max-h-\[33rem\] overflow-y-auto overscroll-contain pr-1/);
  assert.match(page, /<ClassManagement/);
});
