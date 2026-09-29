import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const resolverPath = "src/features/teaching/server/operational-file-resolvers.ts";
const source = readFileSync(resolverPath, "utf8");

test("resolver derives school scope from the authenticated context", () => {
  assert.match(source, /getUserContext\(\)/);
  assert.match(source, /context\.currentSchoolMembership/);
  assert.match(source, /context\.platformMemberships\.length/);
  assert.doesNotMatch(source, /type ResolveInput = \{[\s\S]*schoolId:/);
  assert.match(source, /schoolId: membership\.schoolId/);
  assert.match(source, /staffMemberId: membership\.staffMemberId \?\? null/);
});

test("resolver reuses canonical Teaching Files evidence instead of copying payloads", () => {
  assert.match(source, /getTeachingFilesHub/);
  assert.match(source, /hub\.preparationRecords/);
  assert.match(source, /hub\.officialDocuments/);
  assert.match(source, /hub\.professionalDocuments/);
  assert.match(source, /hub\.authoritativeResources/);
  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.delete\(/);
});

test("every template resolver type has deterministic handling", () => {
  for (const resolverType of [
    "timetable",
    "curriculum",
    "scheme",
    "lesson_preparation",
    "class_list",
    "assessment",
    "calendar",
    "staff_profile",
    "results",
    "room_inventory",
    "shared_resource",
    "teacher_document",
    "external_link",
    "manual",
  ]) {
    assert.match(source, new RegExp(`case ["']${resolverType}["']`), resolverType);
  }
});

test("unproven canonical sources remain unavailable rather than inferred", () => {
  assert.match(source, /case "staff_profile":[\s\S]*case "results":[\s\S]*case "room_inventory":[\s\S]*case "shared_resource":/);
  assert.match(source, /No canonical resolver is proven for this source yet; no evidence was inferred\./);
});

test("external references are explicit HTTPS-only metadata and manual stays manual", () => {
  assert.match(source, /\^https:\\\/\\\/\/i/);
  assert.match(source, /resolverMetadata\.href/);
  assert.match(source, /status: "external"/);
  assert.match(source, /status: "manual"/);
});

test("teacher documents remain actor-owned canonical evidence", () => {
  assert.match(source, /No teacher-owned professional document exists for this actor\./);
  assert.match(source, /ownerStaffMemberId: membership\.staffMemberId/);
  assert.match(source, /sourceModule: "Teacher professional documents"/);
});
