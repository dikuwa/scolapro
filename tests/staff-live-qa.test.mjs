import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read=(p)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const page=read("src/app/staff/page.tsx");
const loading=read("src/app/staff/loading.tsx");
const error=read("src/app/staff/error.tsx");
const directory=read("src/features/staff/server/directory.ts");
const actions=read("src/features/staff/server/actions.ts");

test("staff route exposes loading, empty and error states",()=>{
  assert.match(loading,/Loading staff directory/);
  assert.match(loading,/RouteLoadingIndicator/);
  assert.match(error,/Staff directory could not load/);
  assert.match(error,/No staff identity, placement or import record was changed/);
  assert.match(page,/No school staff linked yet/);
  assert.match(page,/No staff match this search/);
});

test("staff page remains current-school role scoped without Platform Support",()=>{
  assert.match(page,/school_admin/);
  assert.match(page,/principal/);
  assert.match(page,/deputy_principal/);
  assert.match(page,/hod/);
  assert.doesNotMatch(page,/platform_support/);
  assert.match(page,/currentSchoolMembership\?\.schoolId/);
  assert.match(page,/roleKeys = new Set\(schoolMemberships\.map/);
  assert.match(page,/schoolId=\{currentSchoolId\}/);
  assert.match(page,/getSchoolStaffDirectory\(schoolId/);
});

test("single staff mutation remains canonical RPC based",()=>{
  assert.match(actions,/create_or_assign_school_staff/);
  assert.match(actions,/different staff identity/);
  assert.match(actions,/already has a school assignment/);
  assert.match(actions,/later school assignment/);
});

test("staff directory remains responsive across phone tablet and desktop source breakpoints",()=>{
  assert.match(page,/sm:grid-cols-3/);
  assert.match(page,/lg:flex-row/);
  assert.match(page,/md:grid-cols-\\[2rem_minmax\\(0,1fr\\)_minmax\\(11rem,0\\.8fr\\)\\]/);\n  assert.match(page,/lg:grid-cols-\\[2rem_minmax\\(15rem,1\\.1fr\\)_minmax\\(12rem,0\\.72fr\\)_minmax\\(24rem,1\\.45fr\\)\\]/);
  assert.match(page,/max-h-\[70vh\] overflow-auto/);
  assert.match(directory,/pageSize/);
});
