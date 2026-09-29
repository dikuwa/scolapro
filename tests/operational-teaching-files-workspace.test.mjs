import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/teaching/files/page.tsx", "utf8");
const workspace = readFileSync("src/features/teaching/server/operational-files-workspace.ts", "utf8");
const ui = readFileSync("src/features/teaching/components/operational-teaching-files.tsx", "utf8");

test("Teaching Files resolves operational policy from current-school allocations", () => {
  assert.match(page, /context\.currentSchoolMembership/);
  assert.match(page, /getOperationalTeachingFilesWorkspace/);
  assert.match(page, /effectiveOn: hub\.today/);
  assert.match(page, /allocations: hub\.allocations/);
  assert.match(page, /<OperationalTeachingFiles workspace=\{operationalWorkspace\}/);
});

test("only source-proven Information and Communication allocation labels map to the seeded template", () => {
  assert.match(workspace, /normalized === "information and communication" \? "information-communication" : null/);
  assert.match(workspace, /resolveOperationalFileTemplate/);
  assert.match(workspace, /No authoritative operational-file template is mapped for this subject and grade\./);
  assert.doesNotMatch(workspace, /biology.*information-communication/i);
  assert.doesNotMatch(workspace, /physical science.*information-communication/i);
});

test("operational workspace batches canonical evidence resolution and never mutates canonical records", () => {
  assert.match(workspace, /resolveOperationalFileEvidenceBatch/);
  assert.match(workspace, /flatItems/);
  assert.doesNotMatch(workspace, /\.insert\(/);
  assert.doesNotMatch(workspace, /\.update\(/);
  assert.doesNotMatch(workspace, /\.delete\(/);
  assert.doesNotMatch(workspace, /createSupabase/);
});

test("workspace preserves authoritative file types and honest evidence states", () => {
  assert.match(ui, /My operational files/);
  assert.match(ui, /Resolved/);
  assert.match(ui, /Missing/);
  assert.match(ui, /Unavailable/);
  assert.match(ui, /Manual/);
  assert.match(ui, /External/);
  assert.match(ui, /No internal hierarchy is defined by the authoritative source, so ScolaPro does not invent one\./);
  assert.match(ui, /Subjects without a verified operational-file template/);
});

test("operational integration preserves the existing professional Teaching Files hub", () => {
  assert.match(page, /<TeachingFilesHub/);
  assert.match(page, /ownerSchoolId=\{ownerMembership\?\.schoolId \?\? null\}/);
  assert.match(page, /ownerStaffMemberId=\{ownerMembership\?\.staffMemberId \?\? null\}/);
  assert.match(page, /canUploadProfessionalDocuments=\{Boolean\(ownerMembership\)\}/);
});
