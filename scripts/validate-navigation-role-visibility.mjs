import fs from "node:fs";
import path from "node:path";

const navigationPath = path.join(process.cwd(), "src/components/shell/navigation.tsx");
const shellPath = path.join(process.cwd(), "src/components/shell/app-shell.tsx");
const contextPath = path.join(process.cwd(), "src/lib/auth/get-user-context.ts");
const lateArrivalsPagePath = path.join(process.cwd(), "src/app/late-arrivals/page.tsx");
const source = fs.readFileSync(navigationPath, "utf8");
const shellSource = fs.readFileSync(shellPath, "utf8");
const contextSource = fs.readFileSync(contextPath, "utf8");
const lateArrivalsPageSource = fs.readFileSync(lateArrivalsPagePath, "utf8");

const roleBlock = source.match(/const enabledKeysByRole:[\s\S]*?= \{([\s\S]*?)\n\};/);
if (!roleBlock) throw new Error("Unable to locate enabledKeysByRole in navigation.tsx");

const roles = new Map();
for (const match of roleBlock[1].matchAll(/^\s{2}([a-z_]+): \[([^\]]*)\],$/gm)) {
  const keys = [...match[2].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
  roles.set(match[1], new Set(keys));
}

function expectVisible(role, key) {
  if (!roles.get(role)?.has(key)) throw new Error(`Expected ${key} to be visible for ${role}`);
}

function expectHidden(role, key) {
  if (roles.get(role)?.has(key)) throw new Error(`Expected ${key} to be hidden for ${role}`);
}

for (const role of ["school_admin", "principal", "deputy_principal", "class_teacher"]) expectVisible(role, "contributions");
for (const role of ["school_admin", "principal", "deputy_principal", "class_teacher", "counsellor"]) expectVisible(role, "absence_reviews");
for (const role of ["school_admin", "principal", "deputy_principal"]) expectVisible(role, "data_corrections");
for (const role of ["school_admin", "principal", "deputy_principal", "emis_officer"]) expectVisible(role, "statutory");
expectVisible("exam_officer", "dnea_readiness");
expectVisible("circuit_officer", "dnea_readiness");
expectVisible("circuit_officer", "statutory");
expectVisible("regional_officer", "statutory");

expectHidden("counsellor", "data_corrections");
expectHidden("learner", "teaching");
expectHidden("learner", "assessment");
expectHidden("platform_support", "dnea_readiness");
expectHidden("platform_support", "statutory");
expectHidden("librarian", "dnea_readiness");
expectHidden("librarian", "statutory");
for (const role of ["hod", "teacher", "class_teacher", "counsellor", "learner_support", "social_worker", "librarian", "learner", "board_member"]) {
  expectHidden(role, "late_arrivals");
}

if (!contextSource.includes('.from("education_network_memberships")')) {
  throw new Error("Navigation context must resolve effective education-network memberships");
}
if (!shellSource.includes('networkRoles.has("circuit_officer")') || !shellSource.includes('networkRoles.has("regional_officer")')) {
  throw new Error("Shell must derive restricted network navigation from effective network roles");
}
for (const target of [shellSource, lateArrivalsPageSource]) {
  if (!target.includes('.eq("duty_key", "late_arrival_recorder")')) {
    throw new Error("Late-arrival delegation must require the late_arrival_recorder duty");
  }
  if (!target.includes('.eq("staff_member_id", candidate.staffMemberId!)')) {
    throw new Error("Late-arrival delegation must bind the duty to the authenticated actor's staff membership");
  }
  if (!target.includes('.eq("school_id", candidate.schoolId)')) {
    throw new Error("Late-arrival delegation must bind the duty to the actor's exact school membership");
  }
  if (!target.includes('.lte("active_from", today)') || !target.includes('.or(`active_to.is.null,active_to.gte.${today}`)')) {
    throw new Error("Late-arrival delegation must require an effective current duty assignment");
  }
}
if (!shellSource.includes('extraNavigationKeys.push("late_arrivals")')) {
  throw new Error("Effective delegated late-arrival recorders must receive route visibility");
}
if (shellSource.includes('.in("school_id", schoolIds)') || lateArrivalsPageSource.includes('.in("school_id", schoolIds)')) {
  throw new Error("Late-arrival delegation must not use school-only duty lookup that can match another staff member");
}

console.log("Navigation role and capability visibility validation passed.");
