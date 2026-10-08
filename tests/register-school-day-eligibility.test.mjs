import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("governed school-day decisions drive register learner and school totals", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-transform-types",
    "--experimental-loader",
    new URL("./helpers/typescript-alias-loader.mjs", import.meta.url).pathname,
    new URL("./helpers/register-school-day-eligibility-worker.mjs", import.meta.url).pathname,
  ], { cwd: new URL("..", import.meta.url).pathname });

  assert.match(stdout, /governed register school-day scenarios reconciled/);
});

test("SQL resolver contract gives approved overrides precedence over calendar baselines", () => {
  const rangeResolver = readFileSync("supabase/migrations/20260924120000_official_attendance_summary_read_model.sql", "utf8");
  const latestExpectedDay = readFileSync("supabase/migrations/20261006212006_operational_calendar_expansion.sql", "utf8");
  const overrideGovernance = readFileSync("supabase/migrations/20261007143000_calendar_adjustment_provenance_delete.sql", "utf8");

  assert.match(rangeResolver, /when not overrides\.is_school_day then 'NO_TEACHING'/);
  assert.match(rangeResolver, /else overrides\.teaching_impact end/);
  assert.match(rangeResolver, /baseline\.event_impact/);
  assert.match(rangeResolver, /extract\(isodow from baseline\.day\) between 1 and 5/);
  assert.match(latestExpectedDay, /select sdo\.is_school_day/);
  assert.match(latestExpectedDay, /resolve_learner_event_teaching_impact\(target_school_id,target_date\)='NO_TEACHING'/);
  assert.match(overrideGovernance, /v_impact<>'NO_TEACHING'/);
  assert.match(overrideGovernance, /baseline_teaching_impact/);
});
