import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const queries = readFileSync("src/features/sports-houses/server/queries.ts", "utf8");

test("Sports/Houses bundles workspace metadata into one RPC", () => {
  assert.match(queries, /rpc\("get_sports_house_workspace_metadata"/);
  assert.doesNotMatch(queries, /from\("schools"\)/);
  assert.doesNotMatch(queries, /from\("sports_houses"\)/);
  assert.doesNotMatch(queries, /from\("sports_year_settings"\)/);
  assert.doesNotMatch(queries, /from\("sports_age_groups"\)/);
});

test("Sports/Houses preserves metadata mapping and year semantics", () => {
  assert.match(queries, /metadata\.houses/);
  assert.match(queries, /metadata\.age_groups/);
  assert.match(queries, /metadata\.settings/);
  assert.match(queries, /schoolName: metadata\.school\.name/);
  assert.match(queries, /\.\.\.settings\.map\(\(row\) => row\.academicYear\)/);
  assert.match(queries, /assignmentYearsResult\.data/);
});