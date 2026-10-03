import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261003213500_crc_administration_operational_workspace.sql","utf8");
const custody = readFileSync("src/features/crc/server/custody.ts","utf8");
const workspace = readFileSync("src/features/crc/crc-custody-workspace.tsx","utf8");
const page = readFileSync("src/app/school/crc-custody/page.tsx","utf8");
const cumulativeServer = readFileSync("src/features/learners/server/cumulative-record.ts","utf8");
const cumulativePage = readFileSync("src/app/learners/[id]/cumulative-record/page.tsx","utf8");

test("CRC Administration derives readiness and transfer register from canonical domains", () => {
  assert.match(migration,/from public\.enrolments e/);
  assert.match(migration,/from public\.crc_custody_requests r/);
  assert.match(migration,/from public\.crc_custody_records c/);
  assert.match(migration,/from public\.transfer_events te/);
  assert.match(migration,/list_crc_transfer_register/);
  assert.doesNotMatch(migration,/create table/i);
  assert.match(migration,/No duplicate CRC completeness or transfer ledger is stored/);
});

test("administration read models are role-gated and metadata-only for documents", () => {
  assert.match(migration,/is_school_leadership\(auth\.uid\(\),p_school_id\)/);
  assert.match(migration,/is_crc_custodian\(auth\.uid\(\),p_school_id\)/);
  assert.match(migration,/revoke all on function public\.list_crc_administration_documents\(uuid\) from public,anon/);
  assert.doesNotMatch(migration,/returns table\([\s\S]*storage_path/i);
});

test("workspace exposes exactly the five first-class CRC Administration views", () => {
  assert.match(page,/CRC Administration/);
  for (const label of ["Overview","Learners","Requests","Transfers","Documents"]) {
    assert.match(workspace,new RegExp(`"${label}"`));
  }
  assert.doesNotMatch(workspace,/\["incoming", "Incoming"\]/);
  assert.doesNotMatch(workspace,/\["training", "Training"\]/);
  assert.match(workspace,/CRC transfer register/);
  assert.match(workspace,/Open CRC/);
});

test("learner CRC composes canonical source facts without duplicating confidential support content", () => {
  assert.match(cumulativeServer,/attendance_current/);
  assert.match(cumulativeServer,/official_results_current/);
  assert.match(cumulativeServer,/conduct_events/);
  assert.match(cumulativeServer,/learner_support_cases/);
  assert.match(cumulativeServer,/transfer_events/);
  assert.match(cumulativePage,/getEffectiveLearnerGuardianContact/);
  assert.match(cumulativePage,/Case metadata only/);
  assert.match(cumulativePage,/composed view over authoritative ScolaPro domains/);
  assert.match(cumulativePage,/Counselling narratives and intervention notes remain/);
});

test("server loader wires all CRC Administration read models into the existing route", () => {
  assert.match(custody,/listCrcAdministrationLearners/);
  assert.match(custody,/listCrcTransferRegister/);
  assert.match(custody,/listCrcAdministrationDocuments/);
  assert.match(page,/listCrcAdministrationLearners\(membership\.schoolId\)/);
  assert.match(page,/listCrcTransferRegister\(membership\.schoolId\)/);
  assert.match(page,/listCrcAdministrationDocuments\(membership\.schoolId\)/);
});
