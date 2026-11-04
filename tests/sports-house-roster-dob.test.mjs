import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("DOB is optionally rendered identically in HTML, PDF and XLSX without changing defaults", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-transform-types",
    "--experimental-loader",
    new URL("./helpers/typescript-alias-loader.mjs", import.meta.url).pathname,
    new URL("./helpers/sports-house-roster-dob-worker.mjs", import.meta.url).pathname,
  ], { cwd: new URL("..", import.meta.url).pathname });

  assert.match(stdout, /DOB export formats and defaults verified/);
});

test("versioned roster RPC adds DOB without replacing the existing permission contract", () => {
  const migration = readFileSync("supabase/migrations/20261104100000_sports_house_roster_dob_v2.sql", "utf8");
  const hardening = readFileSync("supabase/migrations/20261104140000_sports_houses_authorization_privacy_hardening.sql", "utf8");
  assert.match(migration, /create function public\.get_sports_house_operational_learner_roster_v2/);
  assert.match(migration, /date_of_birth date/);
  assert.match(migration, /can_read_learner_identity\(p_school_id,e\.learner_id\)/);
  assert.match(migration, /e\.school_id=p_school_id/);
  assert.match(migration, /e\.academic_year=p_academic_year/);
  assert.match(migration, /l\.date_of_birth <= ys\.age_reference_date/);
  assert.match(migration, /revoke all .* from public,anon/);
  assert.match(migration, /grant execute .* to authenticated/);
  assert.doesNotMatch(migration, /drop function/i);
  assert.match(hardening, /drop function public\.get_sports_house_operational_learner_roster_v2/);
  assert.match(hardening, /create function public\.get_sports_house_roster_dob_export/);
  assert.match(hardening, /can_read_learner_identity\(p_school_id,e\.learner_id\)/);
  assert.match(hardening, /p_include_date_of_birth is not true/);
  assert.doesNotMatch(
    hardening.slice(hardening.indexOf("returns table("), hardening.indexOf("$sports_operational_roster_v2$")),
    /date_of_birth/,
  );
});

test("default Sports workspace omits raw DOB and server export loads it only after explicit selection", () => {
  const queries = readFileSync("src/features/sports-houses/server/queries.ts", "utf8");
  const route = readFileSync("src/app/api/official-documents/sports-house-roster/route.ts", "utf8");
  assert.match(queries, /get_sports_house_operational_learner_roster_v2/);
  assert.doesNotMatch(queries, /admission_number,sex,date_of_birth/);
  assert.doesNotMatch(queries, /dateOfBirth:\s*row\.date_of_birth/);
  assert.match(queries, /rpc\("get_sports_house_roster_dob_export"/);
  assert.match(route, /requestedColumns\.includes\("dob"\)\s*&&\s*content !== "staff"/);
  assert.match(route, /dateOfBirth: dateOfBirths\.get\(learner\.id\) \?\? null/);
});

test("reference-date writes require an active local School Admin at every entry point", () => {
  const hardening = readFileSync("supabase/migrations/20261104140000_sports_houses_authorization_privacy_hardening.sql", "utf8");
  const actions = readFileSync("src/features/sports-houses/server/actions.ts", "utf8");
  const page = readFileSync("src/app/school/sports-houses/page.tsx", "utf8");
  assert.match(hardening, /sm\.role_key='school_admin'/);
  assert.match(hardening, /sm\.active_from <= \(now\(\) at time zone 'Africa\/Windhoek'\)::date/);
  assert.match(hardening, /array\['platform_admin','platform_support'\]/);
  assert.match(hardening, /set_sports_year_settings/);
  assert.match(hardening, /v_existing_reference_date is distinct from p_age_reference_date/);
  assert.match(actions, /canSetSportsYearReferenceDate/);
  assert.match(actions, /allSchoolMemberships\.some\(\(item\) => item\.schoolId === schoolId && item\.roleKey === "school_admin"\)/);
  assert.match(page, /canManageYearContext = !platformAdmin/);
  assert.match(page, /allSchoolMemberships\.some\(\(item\) => item\.schoolId === schoolId && item\.roleKey === "school_admin"\)/);
});
