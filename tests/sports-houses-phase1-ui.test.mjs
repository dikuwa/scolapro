import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

const page=read("src/app/school/sports-houses/page.tsx");
const loading=read("src/app/school/sports-houses/loading.tsx");
const error=read("src/app/school/sports-houses/error.tsx");
const workspace=read("src/features/sports-houses/sports-houses-workspace.tsx");
const queries=read("src/features/sports-houses/server/queries.ts");
const actions=read("src/features/sports-houses/server/actions.ts");
const navigation=read("src/components/shell/navigation.tsx");

test("Sports / Houses exposes one canonical school route with required route states",()=>{
  assert.match(page,/Sports \/ Houses/);
  assert.match(page,/getSportsHousesWorkspace/);
  assert.match(loading,/Loading Sports and Houses/);
  assert.match(loading,/RouteLoadingIndicator/);
  assert.match(error,/Sports \/ Houses could not load/);
  assert.match(workspace,/No houses configured/);
  assert.match(workspace,/No age groups configured/);
  assert.match(workspace,/No eligible learners/);
  assert.match(workspace,/No eligible staff placements/);
});

test("Phase 1 uses canonical sports tables and governed RPCs",()=>{
  assert.match(queries,/sports_houses/);
  assert.match(queries,/sports_age_groups/);
  assert.match(queries,/sports_house_learner_roster/);
  assert.match(queries,/sports_staff_house_assignments/);
  assert.match(actions,/upsert_sports_house/);
  assert.match(actions,/upsert_sports_age_group/);
  assert.match(actions,/assign_learner_sports_house/);
  assert.match(actions,/assign_staff_sports_house/);
  assert.match(actions,/set_sports_house_status/);
  assert.doesNotMatch(queries,/fixtures|medals|tournaments|sports_scores/);
});

test("management mutates while teaching roles stay read-only in the application surface",()=>{
  assert.match(page,/school_admin/);
  assert.match(page,/principal/);
  assert.match(page,/deputy_principal/);
  assert.match(page,/hod/);
  assert.match(page,/teacher/);
  assert.match(page,/class_teacher/);
  assert.match(page,/platform_support/);
  assert.match(page,/platform_admin/);
  assert.match(workspace,/Read-only/);
});

test("navigation adds exactly one Sports / Houses item to intended school roles",()=>{
  assert.match(navigation,/key: "sports_houses", label: "Sports \/ Houses", href: "\/school\/sports-houses"/);
  for(const role of ["school_admin","principal","deputy_principal","hod","teacher","class_teacher"]){
    const rolePattern=new RegExp(`${role}: \\[([^\\]]|\\n)*"sports_houses"`);
    assert.match(navigation,rolePattern);
  }
  assert.doesNotMatch(navigation,/platform_support: \[[^\]]*"sports_houses"/);
});

test("workspace exposes responsive phone tablet desktop source breakpoints and provenance state",()=>{
  assert.match(workspace,/sm:grid-cols-2/);
  assert.match(workspace,/lg:grid-cols-/);
  assert.match(workspace,/xl:grid-cols-4/);
  assert.match(workspace,/max-h-\[34rem\] overflow-auto/);
  assert.match(workspace,/Source:/);
  assert.match(workspace,/Locked/);
  assert.match(workspace,/unassigned/i);
  assert.match(workspace,/House leader/);
});
