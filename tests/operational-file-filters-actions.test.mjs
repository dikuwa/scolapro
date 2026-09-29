import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync("src/features/teaching/components/operational-teaching-files.tsx", "utf8");
const actions = readFileSync("src/features/teaching/server/operational-file-resource-actions.ts", "utf8");
const resolver = readFileSync("src/features/teaching/server/operational-file-resolvers.ts", "utf8");
const binding = readFileSync("src/features/teaching/components/operational-file-document-binding-form.tsx", "utf8");
const external = readFileSync("src/features/teaching/components/operational-file-external-reference-form.tsx", "utf8");
const hub = readFileSync("src/features/teaching/components/teaching-files.tsx", "utf8");

test("operational files keep hierarchy while adding search and governed filters", () => {
  assert.match(ui, /"use client"/);
  assert.match(ui, /Search requirements/);
  assert.match(ui, /SearchableSelect/);
  assert.match(ui, /label="File"/);
  assert.match(ui, /label="Source type"/);
  assert.match(ui, /label="Status"/);
  assert.match(ui, /Clear filters/);
  assert.match(ui, /allocation\.fileTypes\.flatMap/);
  assert.match(ui, /currentFileType\.sections\.flatMap/);
  assert.doesNotMatch(ui, /const flatRows/);
});

test("only eligible missing noncanonical items expose missing-item actions", () => {
  assert.match(ui, /item\.evidence\.status === "missing"/);
  assert.match(ui, /\["shared_resource", "external_link"\]\.includes\(item\.resolverType\)/);
  assert.match(ui, /item\.resolverType === "teacher_document"/);
  assert.doesNotMatch(ui, /item\.resolverType === "timetable"[\s\S]*OperationalFileExternalReferenceForm/);
  assert.doesNotMatch(ui, /item\.resolverType === "curriculum"[\s\S]*OperationalFileExternalReferenceForm/);
});

test("external reference mutation re-resolves actor workspace before the governed RPC", () => {
  assert.match(actions, /getUserContext\(\)/);
  assert.match(actions, /context\.currentSchoolMembership/);
  assert.match(actions, /context\.memberships\.find/);
  assert.match(actions, /getTeachingFilesHub/);
  assert.match(actions, /getOperationalTeachingFilesWorkspace/);
  assert.match(actions, /eligibleItem\.evidence\.status !== "missing"/);
  assert.match(actions, /\["shared_resource", "external_link"\]\.includes\(eligibleItem\.resolverType\)/);
  assert.match(actions, /create_operational_file_resource/);
  assert.match(actions, /p_scope_type: "teacher"/);
  assert.match(actions, /p_authority_label: "Teacher-provided reference"/);
  assert.match(actions, /p_subject_id: null/);
});

test("external references are HTTPS-only and provider provenance is explicit", () => {
  assert.match(actions, /startsWith\("https:\/\/"\)/);
  assert.match(actions, /provider: z\.string/);
  assert.match(external, /Provider \/ source/);
  assert.match(external, /pattern="https:\/\/\.\*"/);
  assert.match(external, /Teacher external reference/);
});

test("teacher-document requirements bind an existing private owner document rather than copying it", () => {
  assert.match(actions, /eligibleItem\.resolverType !== "teacher_document"/);
  assert.match(actions, /hub\.professionalDocuments\.find/);
  assert.match(actions, /p_teacher_document_id: document\.id/);
  assert.match(actions, /p_external_url: null/);
  assert.match(actions, /p_provider: "Teacher upload"/);
  assert.match(actions, /p_authority_label: "Teacher-provided evidence"/);
  assert.match(binding, /This creates a reference to your existing private upload\. The binary file is not copied\./);
  assert.match(binding, /SearchableSelect/);
});

test("teacher-document resolver requires an item binding instead of treating every upload as evidence", () => {
  assert.match(resolver, /sharedResourceResult\("teacher_document"\)/);
  assert.match(resolver, /No teacher-owned professional document is bound to this operational-file requirement\./);
  assert.doesNotMatch(resolver, /hub\.professionalDocuments\.map\(\(document\)/);
});

test("missing teacher evidence reuses the existing professional upload surface", () => {
  assert.match(binding, /href="#professional-files-upload"/);
  assert.match(hub, /id="professional-files-upload"/);
  assert.match(hub, /My uploaded professional documents/);
});

test("issue 879 adds no storage or schema layer", () => {
  assert.doesNotMatch(actions, /storage\./);
  assert.doesNotMatch(actions, /\.from\([^\n]*\)\.insert/);
  assert.doesNotMatch(actions, /create table/i);
});
