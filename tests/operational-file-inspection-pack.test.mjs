import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const operationalRoute = readFileSync("src/app/api/teaching/files/inspection-pack/route.ts", "utf8");
const subjectRoute = readFileSync("src/app/api/teaching/subject-file/inspection-pack/route.ts", "utf8");
const operationalUi = readFileSync("src/features/teaching/components/operational-teaching-files.tsx", "utf8");

test("operational inspection pack stays inside current-school teacher identity", () => {
  assert.match(operationalRoute, /context\.currentSchoolMembership/);
  assert.match(operationalRoute, /context\.platformMemberships\.length/);
  assert.match(operationalRoute, /\["teacher", "class_teacher", "hod"\]/);
  assert.match(operationalRoute, /staffMemberId: ownerMembership\.staffMemberId/);
});

test("operational inspection pack reuses canonical workspace and control-sheet projections", () => {
  assert.match(operationalRoute, /getTeachingFilesHub/);
  assert.match(operationalRoute, /getOperationalTeachingFilesWorkspace/);
  assert.match(operationalRoute, /getOperationalFileControlSheet/);
  assert.doesNotMatch(operationalRoute, /\.insert\(/);
  assert.doesNotMatch(operationalRoute, /\.update\(/);
  assert.doesNotMatch(operationalRoute, /\.delete\(/);
});

test("inspection pack keeps readiness and review conceptually separate", () => {
  assert.match(operationalRoute, /Readiness and review are separate/);
  assert.match(operationalRoute, /item\.evidence\.status/);
  assert.match(operationalRoute, /row\.events/);
  assert.match(operationalRoute, /row\.reviewNote/);
});

test("operational pack is private print-ready A4 and supports browser Save PDF", () => {
  assert.match(operationalRoute, /OFFICIAL_DOCUMENT_A4_PAGE_RULE/);
  assert.match(operationalRoute, /renderOfficialDocumentHtmlHeader\(header/);
  assert.match(operationalRoute, /officialDocumentHeaderModeForType\("teaching_files_inspection_pack"\)/);
  assert.match(operationalRoute, /Print \/ Save PDF/);
  assert.match(operationalRoute, /cache-control": "private, no-store"/);
  assert.match(operationalRoute, /content-type": "text\/html; charset=utf-8"/);
  assert.match(operationalUi, /\/api\/teaching\/files\/inspection-pack/);
  assert.match(operationalUi, /Inspection pack/);
});

test("Subject File pack includes authoritative policy hierarchy without inventing unsupported subjects", () => {
  assert.match(subjectRoute, /row\.policyHierarchy/);
  assert.match(subjectRoute, /Official Subject File hierarchy/);
  assert.match(subjectRoute, /item\.resolverType/);
  assert.match(subjectRoute, /item\.status/);
  assert.match(subjectRoute, /No authoritative Subject File hierarchy is recorded for this subject/);
  assert.match(subjectRoute, /does not apply another subject's policy by assumption/);
});

test("existing Subject File print privacy and read-only behavior remains intact", () => {
  assert.match(subjectRoute, /Print \/ Save PDF/);
  assert.match(subjectRoute, /private, no-store/);
  assert.match(subjectRoute, /read-only dossier/);
  assert.doesNotMatch(subjectRoute, /insert\(|update\(|delete\(/i);
});


test("inspection pack does not collapse unavailable review sources into empty history", () => {
  assert.match(operationalRoute, /controlSheet\.preparationUnavailable/);
  assert.match(operationalRoute, /controlSheet\.professionalFileUnavailable/);
  assert.match(operationalRoute, /unavailableReviewSources/);
});
