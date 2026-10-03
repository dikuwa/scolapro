import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261003180000_sports_houses_operational_completion.sql", "utf8");

test("sports operational roster exposes governed filter dimensions without a second roster store", () => {
  assert.match(migration, /get_sports_house_operational_learner_roster/);
  assert.match(migration, /grade_name text/);
  assert.match(migration, /register_class_name text/);
  assert.match(migration, /sex text/);
  assert.match(migration, /sports_learner_house_assignments/);
  assert.doesNotMatch(migration, /create table .*sports.*roster/i);
});

test("source U13-U20 labels are proposal-only and never canonical writes", () => {
  assert.match(migration, /sports_age_group_source_proposals/);
  assert.match(migration, /array\['U13','U14','U15','U16','U17','U18','U19','U20'\]/);
  assert.match(migration, /canonical_write',false/);
  assert.doesNotMatch(migration, /insert into public\.sports_age_groups/i);
  assert.doesNotMatch(migration, /insert into public\.sports_year_settings/i);
});

test("shared immediate guardian resolver follows effective phone fallback and excludes addresses", () => {
  assert.match(migration, /resolve_effective_learner_guardian_contact/);
  assert.match(migration, /gc\.contact_type in \('mobile','phone'\)/);
  assert.match(migration, /order by lg\.priority/);
  assert.match(migration, /gc\.effective_from<=p_reference_date/);
  assert.doesNotMatch(migration, /guardian_addresses/);
});

test("compact learner context derives house and subjects from canonical stores", () => {
  assert.match(migration, /sports_learner_house_assignments/);
  assert.match(migration, /learner_subject_registrations/);
  assert.match(migration, /lsr\.status='active'/);
});
