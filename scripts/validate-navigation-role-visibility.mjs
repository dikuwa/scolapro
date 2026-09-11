import fs from "node:fs";
import path from "node:path";

const navigationPath = path.join(process.cwd(), "src/components/shell/navigation.tsx");
const shellPath = path.join(process.cwd(), "src/components/shell/app-shell.tsx");
const shellFramePath = path.join(process.cwd(), "src/components/shell/shell-frame.tsx");
const contextPath = path.join(process.cwd(), "src/lib/auth/get-user-context.ts");
const lateArrivalsPagePath = path.join(process.cwd(), "src/app/late-arrivals/page.tsx");
const libraryPagePath = path.join(process.cwd(), "src/app/library/page.tsx");
const learnersPagePath = path.join(process.cwd(), "src/app/learners/page.tsx");
const learnerDetailPagePath = path.join(process.cwd(), "src/app/learners/[id]/page.tsx");
const learnerCrcPagePath = path.join(process.cwd(), "src/app/learners/[id]/cumulative-record/page.tsx");
const staffPagePath = path.join(process.cwd(), "src/app/staff/page.tsx");
const source = fs.readFileSync(navigationPath, "utf8");
const shellSource = fs.readFileSync(shellPath, "utf8");
const shellFrameSource = fs.readFileSync(shellFramePath, "utf8");
const contextSource = fs.readFileSync(contextPath, "utf8");
const lateArrivalsPageSource = fs.readFileSync(lateArrivalsPagePath, "utf8");
const libraryPageSource = fs.readFileSync(libraryPagePath, "utf8");
const learnersPageSource = fs.readFileSync(learnersPagePath, "utf8");
const learnerDetailPageSource = fs.readFileSync(learnerDetailPagePath, "utf8");
const learnerCrcPageSource = fs.readFileSync(learnerCrcPagePath, "utf8");
const staffPageSource = fs.readFileSync(staffPagePath, "utf8");

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
for (const role of ["school_admin", "principal", "deputy_principal", "librarian", "ltsm"]) expectVisible(role, "library");
for (const role of ["school_admin", "principal", "deputy_principal", "hod"]) expectVisible(role, "staff");
for (const role of ["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher", "counsellor", "learner_support", "social_worker", "librarian"]) expectVisible(role, "learners");
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
for (const role of ["platform_admin", "platform_support", "circuit_officer", "regional_officer", "emis_officer", "exam_officer", "hod", "teacher", "class_teacher", "counsellor", "learner_support", "social_worker", "learner", "parent", "board_member"]) {
  expectHidden(role, "library");
}
for (const role of ["hod", "teacher", "class_teacher", "counsellor", "learner_support", "social_worker", "librarian", "learner", "board_member"]) {
  expectHidden(role, "late_arrivals");
}

if (!libraryPageSource.includes('const ltsmRoles = new Set(["school_admin", "principal", "deputy_principal", "librarian", "ltsm"])')) {
  throw new Error("Library route authorization must match existing school-local LTSM roles");
}
if (!libraryPageSource.includes('context.memberships.find((candidate) => ltsmRoles.has(candidate.roleKey))')) {
  throw new Error("Library route must authorize through an effective school membership");
}
if (libraryPageSource.includes("platformMemberships") || libraryPageSource.includes("networkMemberships")) {
  throw new Error("Library route must not grant platform or network circulation access");
}
if (!contextSource.includes('.from("education_network_memberships")')) {
  throw new Error("Navigation context must resolve effective education-network memberships");
}
if (!shellSource.includes('networkRoles.has("circuit_officer")') || !shellSource.includes('networkRoles.has("regional_officer")')) {
  throw new Error("Shell must derive restricted network navigation from effective network roles");
}
if (!shellSource.includes('context.memberships.map((item) => item.roleKey)') || !shellSource.includes('roleKeys={roleKeys}')) {
  throw new Error("School navigation must preserve capabilities from all active school memberships");
}
if (!source.includes("function itemsForRoles(") || !source.includes("for (const candidateRole of resolvedRoles)")) {
  throw new Error("Navigation must union role visibility across active school memberships");
}
if (!shellFrameSource.includes("roleKeys={roleKeys}")) {
  throw new Error("Desktop shell navigation must receive all active role keys");
}
for (const [label, target] of [
  ["learners", learnersPageSource],
  ["learner detail", learnerDetailPageSource],
  ["learner cumulative record", learnerCrcPageSource],
  ["staff", staffPageSource],
]) {
  if (target.includes("context.memberships[0]")) {
    throw new Error(`${label} route must not infer operational school authorization from memberships[0]`);
  }
  if (!target.includes("context.memberships.find(")) {
    throw new Error(`${label} route must resolve an explicitly authorized school membership`);
  }
}
if (!learnersPageSource.includes('const learnerDirectoryRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher", "counsellor", "learner_support", "social_worker", "librarian"])')) {
  throw new Error("Learner directory route roles must remain aligned with learner navigation visibility");
}
if (!staffPageSource.includes('const staffDirectoryRoles = new Set(["school_admin", "principal", "deputy_principal", "hod"])')) {
  throw new Error("Staff route roles must remain aligned with staff navigation visibility");
}
if (!learnersPageSource.includes('canRegisterLearner = membership.roleKey === "school_admin"')) {
  throw new Error("Learner registration action must stay hidden outside School Admin scope");
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
