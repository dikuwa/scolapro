import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/app/school/settings/page.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/features/statutory/school-statutory-profile-panel.tsx", import.meta.url), "utf8");
const query = await readFile(new URL("../src/features/statutory/server/school-profile.ts", import.meta.url), "utf8");
const action = await readFile(new URL("../src/features/statutory/server/school-profile-actions.ts", import.meta.url), "utf8");

test("School Settings binds Statutory / EMIS Profile to deterministic current school", () => {
  assert.match(page, /context\.currentSchoolMembership/);
  assert.match(page, /getSchoolStatutoryEmisProfile\(membership\.schoolId\)/);
  assert.match(page, /SchoolStatutoryEmisProfilePanel schoolId=\{membership\.schoolId\}/);
  assert.doesNotMatch(page, /context\.memberships\.find\(\(item\) => settingsRoles/);
});

test("profile surface reuses canonical read-only school facts", () => {
  for (const label of ["EMIS number", "Region", "Circuit", "Cluster", "Canonical address", "Canonical contact", "Hostel profile"]) {
    assert.match(panel, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(query, /get_school_statutory_emis_profile/);
});

test("editable profile is descriptive and does not ask users for official codes", () => {
  assert.match(panel, /Pay point/);
  assert.match(panel, /Constituency/);
  assert.match(panel, /School classification/);
  assert.match(panel, /Ownership/);
  assert.match(panel, /Urban \/ rural/);
  assert.match(panel, /Satellite school/);
  assert.match(panel, /Cluster centre/);
  assert.doesNotMatch(panel, /name="[^"]*Code"/);
  assert.match(panel, /official code mapping is owned by the statutory code registry/i);
});

test("server action rechecks current-school management scope", () => {
  assert.match(action, /context\.currentSchoolMembership/);
  assert.match(action, /membership\.schoolId !== schoolId/);
  assert.match(action, /school_admin/);
  assert.match(action, /principal/);
  assert.match(action, /deputy_principal/);
  assert.match(action, /save_school_statutory_emis_profile/);
});
