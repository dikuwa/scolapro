import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261122204600_school_grading_scale_governed_configuration.sql", "utf8");
const server = readFileSync("src/features/assessment/server/school-grading-scales.ts", "utf8");
const view = readFileSync("src/features/assessment/school-grading-scales-view.tsx", "utf8");
const route = readFileSync("src/app/assessment/grading-scales/page.tsx", "utf8");
const assessment = readFileSync("src/app/assessment/page.tsx", "utf8");

test("school grading scales are managed by school leadership only", () => {
  assert.match(server, /currentSchoolMembership/);
  assert.match(server, /platformMemberships\.length/);
  for (const role of ["school_admin", "principal", "deputy_principal"]) {
    assert.ok(server.includes(role));
    assert.ok(migration.includes(role));
  }
  assert.match(migration, /security invoker/gi);
  assert.doesNotMatch(server, /createSupabaseAdminClient|service_role/i);
});

test("create, edit and activate are separate, explicit governed mutations", () => {
  for (const rpc of ["create_school_grading_scale", "replace_school_grading_scale_draft_bands", "activate_school_grading_scale"]) {
    assert.ok(server.includes('rpc("' + rpc + '"'));
    assert.ok(migration.includes("function public." + rpc));
  }
  assert.match(server, /confirmed: z\.literal\("yes"\)/);
  assert.match(view, /Activate and freeze/);
  assert.match(view, /CheckboxField/);
  assert.match(view, /name="confirmed"/);
});

test("band activation validates exact range and precision; active versions are immutable", () => {
  assert.match(migration, /v_step := power\(10::numeric,-new\.decimal_places\)/);
  assert.match(migration, /v_band\.minimum_value <> v_prev \+ v_step/);
  assert.match(migration, /v_prev <> 100/);
  assert.match(migration, /old\.status in \('active','superseded','archived'\)/);
  assert.match(migration, /Activated grading scale bands are immutable/);
  assert.match(migration, /grading_band_finality_guard/);
  assert.match(migration, /grading_scale_finality_guard/);
});

test("band replacement is transactional and historical actions are auditable", () => {
  assert.match(migration, /select \* into v_scale from public\.grading_scales where id=p_scale_id for update/);
  assert.match(migration, /if v_scale\.status <> 'draft' then/);
  assert.match(migration, /delete from public\.grading_scale_bands where grading_scale_id=v_scale\.id/);
  assert.match(migration, /grading_scale_lifecycle_audit_trg/);
  assert.match(migration, /actor_user_id/);
  assert.match(server, /Draft scale could not be verified after saving/);
  assert.match(server, /Activation status could not be verified/);
});

test("new route is discoverable, school-local and does not invent national grading values", () => {
  assert.ok(assessment.includes("/assessment/grading-scales"));
  assert.ok(route.includes("getSchoolGradingScales"));
  assert.match(view, /No symbols, cutoffs or national grading rules are supplied automatically/);
  assert.match(view, /school-authorized values/);
  assert.match(server, /\.eq\("school_id", scope\.schoolId\)/);
  assert.doesNotMatch(migration, /insert into public\.grading_scales[\s\S]*values\s*\('N11'|values\s*\('DNEA'/i);
});
