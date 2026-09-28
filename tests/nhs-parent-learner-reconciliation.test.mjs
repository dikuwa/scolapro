import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("NHS reconciliation payload preserves roster safety boundaries", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "nhs-reconciliation-"));
  try {
    const learners = path.join(dir, "learners.csv");
    const guardians = path.join(dir, "guardians.csv");
    const output = path.join(dir, "payload.json");

    writeFileSync(
      learners,
      [
        "learner_admission_number,grade,register_class,source_sheet,source_row,surname,preferred_name_raw,sex,date_of_birth,date_of_admission,source_id_number_raw,source_id_number_safe_to_map_national_id",
        "4806,8,8A,GRADE 8 A,9,ADAMS,Dawid JMW,M,2012-02-01,2026-01-12,120201,NO",
      ].join("\n"),
    );

    writeFileSync(
      guardians,
      [
        "learner_admission_number,grade,register_class,guardian_priority,relationship_type,guardian_name_raw,guardian_name_normalized,mobile_raw,mobile_normalized,home_phone_raw,home_phone_normalized,work_phone_raw,work_phone_normalized,email_raw,email_normalized,residential_address,postal_address,work_address,is_legal_guardian,is_emergency_contact,is_pickup_authorized,source_sheet,source_row",
        '4806,8,8A,1,parent,DAWID ADAMS,DAWID ADAMS,081 281 9741,0812819741,,,,,parent@example.test,parent@example.test,"ERF 1 TEST STREET","P.O. BOX 1",,,,,GRADE 8 A,9',
      ].join("\n"),
    );

    execFileSync(
      process.execPath,
      [
        "scripts/build-nhs-parent-learner-reconciliation-payload.mjs",
        "--learners", learners,
        "--guardians", guardians,
        "--out", output,
      ],
      { stdio: "pipe" },
    );

    const payload = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(payload.counts.learner_rows, 1);
    assert.equal(payload.counts.guardian_rows, 1);

    const learner = payload.learner_rows[0];
    assert.equal(learner.normalized.admission_number, "4806");
    assert.equal(learner.normalized.register_class_code, "8A");
    assert.equal(learner.normalized.sex, "male");
    assert.equal(learner.normalized.source_id_number_raw, "120201");
    assert.equal("national_id" in learner.normalized, false);
    assert.match(
      learner.issues.map((issue) => issue.message).join(" "),
      /not mapped to national_id/i,
    );

    const guardian = payload.guardian_rows[0];
    assert.equal(guardian.normalized.first_names, "DAWID");
    assert.equal(guardian.normalized.surname, "ADAMS");
    assert.equal(guardian.normalized.relationship_type, "parent");
    assert.equal(guardian.normalized.is_legal_guardian, false);
    assert.equal(guardian.normalized.is_emergency_contact, false);
    assert.equal(guardian.normalized.is_pickup_authorized, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
