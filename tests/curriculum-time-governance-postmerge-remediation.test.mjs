import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261003030500_curriculum_time_governance_postmerge_remediation.sql",
  "utf8",
);

test("profile-level supersession is honored across governance conflict checks", () => {
  assert.match(migration,/curriculum_time_profile_supersedes\(new\.id,existing\.profile_id\)/);
  assert.match(migration,/curriculum_time_profile_supersedes\(pa\.id,pb\.id\)/);
  assert.match(migration,/curriculum_time_profile_supersedes\(new\.profile_id,other\.profile_id\)/);

  const overlapGuard = migration.slice(
    migration.lastIndexOf(
      "create or replace function app_private.guard_curriculum_time_allocation_overlap()",
    ),
  );
  assert.match(
    overlapGuard,
    /not app_private\.curriculum_time_profile_supersedes\(new\.profile_id,other\.profile_id\)/,
  );
  assert.match(
    overlapGuard,
    /not app_private\.curriculum_time_profile_supersedes\(other\.profile_id,new\.profile_id\)/,
  );
});

test("published profiles have a database-wide deferred nonempty invariant", () => {
  assert.match(migration,/create constraint trigger zz_curriculum_time_profile_nonempty_publication_ctr/i);
  assert.match(migration,/deferrable initially deferred/i);
  assert.match(migration,/profile publication requires at least one reviewed allocation/i);
});

test("conflict resolution locks deterministically before revalidating the conflict", () => {
  const branch = migration.slice(
    migration.indexOf("if p_action='resolve_conflict' then"),
    migration.indexOf("if p_action='link_supersession' then"),
  );
  const lock = branch.indexOf("order by id\n    for update");
  const validate = branch.indexOf("get_curriculum_time_governance_conflicts()");
  assert.ok(lock >= 0, "pair lock must be present");
  assert.ok(validate >= 0, "conflict validation must be present");
  assert.ok(lock < validate, "pair must be locked before conflict is revalidated");
  assert.match(branch,/get diagnostics v_locked_count = row_count/);
  assert.match(branch,/v_status='published'[\s\S]*v_related_status='withdrawn'/);
  assert.match(branch,/curriculum_time_source_conflict_resolved/);
  assert.ok(
    branch.indexOf("curriculum_time_source_conflict_resolved") < validate,
    "an already committed identical resolution must return idempotently before conflict revalidation",
  );
});
