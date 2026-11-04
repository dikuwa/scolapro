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
  assert.match(migration, /create function public\.get_sports_house_operational_learner_roster_v2/);
  assert.match(migration, /date_of_birth date/);
  assert.match(migration, /can_read_learner_identity\(p_school_id,e\.learner_id\)/);
  assert.match(migration, /e\.school_id=p_school_id/);
  assert.match(migration, /e\.academic_year=p_academic_year/);
  assert.match(migration, /l\.date_of_birth <= ys\.age_reference_date/);
  assert.match(migration, /revoke all .* from public,anon/);
  assert.match(migration, /grant execute .* to authenticated/);
  assert.doesNotMatch(migration, /drop function/i);
});
