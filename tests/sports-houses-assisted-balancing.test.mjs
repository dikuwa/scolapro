import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

const panel=read("src/features/sports-houses/assisted-balancing-panel.tsx");
const actions=read("src/features/sports-houses/server/actions.ts");
const workspace=read("src/features/sports-houses/sports-houses-workspace.tsx");
const page=read("src/app/school/sports-houses/page.tsx");

test("Phase 2 is preview-first with an explicit governed apply action",()=>{
  assert.match(panel,/Preview balance/);
  assert.match(panel,/No writes until Apply/);
  assert.match(panel,/Apply .* balance/);
  assert.match(actions,/preview_sports_house_balancing/);
  assert.match(actions,/apply_sports_house_balancing/);
  assert.match(actions,/get_sports_house_balancing_run/);
});

test("balancing preview surfaces required totals moves provenance and cohorts",()=>{
  assert.match(panel,/Before totals/);
  assert.match(panel,/Proposed after totals/);
  assert.match(panel,/Proposed moves/);
  assert.match(panel,/Source:/);
  assert.match(panel,/Locked/);
  assert.match(panel,/Sex/);
  assert.match(panel,/Age group/);
  assert.match(panel,/Grade/);
  assert.match(panel,/Algorithm/);
});

test("learner and staff balancing remain separate and manager-only in the workspace",()=>{
  assert.match(panel,/value: "learner"/);
  assert.match(panel,/value: "staff"/);
  assert.match(panel,/Staff are balanced separately/);
  assert.match(workspace,/canManage \? <AssistedBalancingPanel/);
  assert.match(page,/platformSupport/);
  assert.match(page,/platformAdmin/);
  assert.match(page,/managerRoles/);
});

test("responsive source covers phone tablet and desktop layouts",()=>{
  assert.match(panel,/sm:grid-cols-/);
  assert.match(panel,/lg:flex-row/);
  assert.match(panel,/lg:grid-cols-/);
  assert.match(workspace,/sm:grid-cols-2/);
  assert.match(workspace,/xl:grid-cols-4/);
});

test("Phase 2 stays bounded to houses and allocation",()=>{
  assert.doesNotMatch(panel,/fixtures|medals|tournaments|score entry|athletics events/i);
  assert.doesNotMatch(actions,/fixture|medal|tournament|sports_score/i);
  assert.match(workspace,/Fixtures, events, scores, medals, records and tournaments remain outside this workspace/);
});
