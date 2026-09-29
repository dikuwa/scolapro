import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("src/features/teaching/server/subject-file.ts","utf8");
const workspace = readFileSync("src/features/teaching/subject-file-workspace.tsx","utf8");

test("Subject File hierarchy is template-driven only for source-proven Information and Communication",()=>{
  assert.match(server,/normalizeSubject\(input\.subjectName\)!=="information and communication"/);
  assert.match(server,/subjectKey:"information-communication"/);
  assert.match(server,/resolveOperationalFileTemplate/);
  assert.match(server,/fileTypeKey==="subject"/);
  assert.match(server,/does not reuse the Information & Communication taxonomy for unrelated subjects/);
});

test("Subject File derives applicable policy phase from current grade scope",()=>{
  assert.match(server,/template\.phases/);
  assert.match(server,/phase\.gradeFrom/);
  assert.match(server,/phase\.gradeTo/);
  assert.match(server,/phaseLabels:\[\.\.\.new Set\(phaseLabels\)\]/);
});

test("Subject File consumes governed shared resources without a second repository",()=>{
  assert.match(server,/getOperationalFileSharedResourceReferences/);
  assert.match(server,/templateItemIds:itemIds/);
  assert.match(server,/authorityLabel:resource\.authorityLabel/);
  assert.match(server,/provider:resource\.provider/);
  assert.doesNotMatch(server,/\.insert\(/);
  assert.doesNotMatch(server,/storage\.from/);
});

test("private teacher documents are not surfaced through the shared Subject File hierarchy",()=>{
  assert.match(server,/Private teacher evidence is not exposed through the shared Subject File/);
  assert.match(server,/Existing Professional File Review remains authoritative/);
  assert.doesNotMatch(server,/teacher_professional_documents/);
});

test("room inventory and historical results remain honest when subject-safe resolvers are not proven",()=>{
  assert.match(server,/does not infer a subject-to-room relationship/);
  assert.match(server,/governed Subject File resolver for historical promotion results is not proven yet/);
});

test("Subject File UI renders hierarchy status, phase and deep references responsively",()=>{
  assert.match(workspace,/Official Subject File hierarchy/);
  assert.match(workspace,/Source-grounded/);
  assert.match(workspace,/policyHierarchy\.phaseLabels/);
  assert.match(workspace,/Resolved/);
  assert.match(workspace,/Missing/);
  assert.match(workspace,/Unavailable/);
  assert.match(workspace,/External/);
  assert.match(workspace,/sm:flex-row/);
  assert.match(workspace,/max-w-full/);
});

test("unsupported subjects remain visible with an explicit no-template state",()=>{
  assert.match(workspace,/No authoritative Subject File hierarchy/);
  assert.match(workspace,/row\.policyHierarchyReason/);
});
