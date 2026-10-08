import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navigation = readFileSync("src/components/shell/navigation.tsx", "utf8");
const setupPage = readFileSync("src/app/school/setup/page.tsx", "utf8");
const capabilities = readFileSync("src/lib/auth/school-capabilities.ts", "utf8");
const structure = readFileSync("src/features/academics/server/structure.ts", "utf8");
const classManagement = readFileSync("src/features/academics/class-management.tsx", "utf8");
const actions = readFileSync("src/features/academics/server/actions.ts", "utf8");

test("all school leadership roles retain Academic setup and Responsibilities routes", () => {
  for (const role of ["school_admin", "principal", "deputy_principal"]) {
    const match = navigation.match(new RegExp(`${role}: \\[([^\\]]+)\\]`));
    assert.ok(match, `${role} navigation entry missing`);
    assert.match(match[1], /"setup"/);
    assert.match(match[1], /"responsibilities"/);
  }
  assert.match(navigation, /key: "setup".*href: "\/school\/setup"/s);
  assert.match(navigation, /key: "responsibilities".*href: "\/school\/responsibilities"/s);
});

test("Academic setup is reachable by school admin, principal and deputy principal", () => {
  assert.match(capabilities, /\["school_admin", "principal", "deputy_principal"\]/);
  assert.match(setupPage, /hasAnySchoolRole\(schoolMemberships, currentSchoolId, schoolLeadershipRoles\)/);
  assert.match(setupPage, /canManageAcademicStructure = schoolRoleKeys\.has\("school_admin"\)/);
});

test("register classes expose assigned register teachers and active school staff candidates", () => {
  assert.match(structure, /register_teacher_staff_id/);
  assert.match(structure, /registerTeacherName/);
  assert.match(structure, /list_school_duty_staff_candidates/);
  assert.match(classManagement, /Register teacher:/);
  assert.match(classManagement, /Search active staff/);
  assert.match(classManagement, /Unassigned/);
});

test("register teacher assignment uses the governed RPC and refreshes dependent routes", () => {
  assert.match(actions, /assignRegisterTeacher/);
  assert.match(actions, /assign_register_teacher/);
  assert.match(actions, /revalidatePath\("\/school\/setup"\)/);
  assert.match(actions, /revalidatePath\("\/attendance"\)/);
  assert.match(actions, /revalidatePath\("\/class-lists"\)/);
});
