import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const queries=await read("src/features/teaching/server/file-queries.ts");
const workspace=await read("src/features/teaching/components/teaching-files.tsx");
const page=await read("src/app/teaching/files/page.tsx");

test("professional files hub links canonical system records instead of copying them",()=>{
  assert.match(queries,/authoritativeResources/);
  assert.match(queries,/href: "\/timetable"/);
  assert.match(queries,/href: "\/teaching\/curriculum"/);
  assert.match(queries,/href: "\/teaching\/planning"/);
  assert.match(queries,/href: "\/teaching\/preparation"/);
  assert.match(queries,/href: "\/class-lists"/);
  assert.match(queries,/href: "\/assessment\/marks"/);
  assert.match(queries,/href: "\/calendar"/);
  assert.doesNotMatch(queries,/insert\([^)]*teacher_professional_documents/i);
});

test("year planner and scheme reuse one canonical planning module",()=>{
  const planningLinks=[...queries.matchAll(/href: "\/teaching\/planning"/g)];
  assert.ok(planningLinks.length>=2);
  assert.match(queries,/Year Planner data remains part of the canonical teaching plan/);
  assert.match(queries,/no duplicate professional-file copy is created/);
});

test("teacher uploads remain visibly separate private owned evidence",()=>{
  assert.match(workspace,/Authoritative ScolaPro records/);
  assert.match(workspace,/My uploaded professional documents/);
  assert.match(workspace,/Private teacher-owned files, evidence and resources/);
  assert.match(workspace,/never copies system records into your uploaded-document store/);
});

test("authoritative records open their source modules",()=>{
  assert.match(workspace,/Open source module/);
  assert.match(workspace,/Link href=\{resource\.href\}/);
  assert.match(workspace,/resource\.sourceModule/);
});

test("existing export behavior is described only where already offered",()=>{
  assert.match(queries,/Class Lists/);
  assert.match(queries,/supports print, PDF and Excel export/);
  assert.match(queries,/Print\/PDF follows the existing teaching document path where available/);
});

test("existing ownership and unsourced taxonomy guardrails remain",()=>{
  assert.match(queries,/OFFICIAL_TEACHER_FILE_TAXONOMY_SOURCED = false/);
  assert.match(page,/ownerStaffMemberId/);
  assert.match(page,/canUploadProfessionalDocuments/);
});
