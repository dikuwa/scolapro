import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const migration=read("supabase/migrations/20261008145100_staff_operational_hod_without_invitation.sql");
const actions=read("src/features/staff/server/access-actions.ts");
const ui=read("src/features/staff/staff-access-manager.tsx");
const directory=read("src/features/staff/server/directory.ts");
const hod=read("src/features/academics/server/hod-scope.ts");

test("uninvited HOD designation is independent of login memberships",()=>{
 assert.match(migration,/create table public.staff_operational_hod_designations/);
 assert.match(migration,/staff_assignment_id uuid not null/);
 assert.doesNotMatch(migration,/\n\s+user_id uuid not null references auth.users\(id\)/);
 assert.doesNotMatch(migration,/insert into public.school_memberships/i);
 assert.match(migration,/school_memberships\.user_id remains NOT NULL/);
 assert.match(actions,/designate_staff_operational_hod/);
 assert.match(directory,/operationalHodDesignation/);
 assert.match(ui,/Assign HOD placement/);
 assert.match(ui,/without creating a ScolaPro account/);
});

test("HOD designation writes require school leadership and preserve history",()=>{
 assert.match(migration,/user_current_school_matches\(auth.uid\(\),p_school_id\)/);
 assert.match(migration,/has_school_role\(p_school_id,array\['school_admin','principal','deputy_principal'\]\)/);
 assert.match(migration,/security definer set search_path=pg_catalog,public,app_private/);
 assert.match(migration,/staff_operational_hod_open_idx/);
 assert.match(migration,/guard_staff_operational_hod_history/);
 assert.match(migration,/staff\.operational_hod_designated/);
 assert.match(migration,/staff\.operational_hod_ended/);
 assert.match(migration,/revoke insert,update,delete/);
 assert.match(migration,/revoke all on function public.designate_staff_operational_hod/);
});

test("appointment RPC accepts governed operational placements without bypassing login access",()=>{
 assert.match(migration,/create or replace function public.appoint_hod_portfolio/);
 assert.match(migration,/exists\(select 1 from public.staff_operational_hod_designations d/);
 assert.match(migration,/m.role_key='hod'/);
 assert.match(migration,/update public.subject_department_responsibilities set effective_to=/);
 assert.match(hod,/operationalHodAssignments/);
 assert.match(hod,/currentHodStaff\.has\(assignment.staff_member_id\) \|\| operationalHodAssignments.has/);
});

test("Staff Directory role editor remains independent of invitation and identity controls",()=>{
 assert.match(ui,/data-staff-operational-hod/);
 assert.match(ui,/panel === "hod-placement"/);
 assert.match(ui,/onClick=\{\(\) => togglePanel\("hod-placement"\)\}/);
 assert.match(ui,/panel === "identity"/);
 assert.match(ui,/panel === "access"/);
 assert.match(ui,/endStaffOperationalHod/);
});

test("Staff preview still loads when only the additive designation table is not deployed",()=>{
 assert.match(directory,/designationTableMissing/);
 assert.match(directory,/42P01/);
 assert.match(directory,/PGRST205/);
 assert.match(directory,/designationResult\.error && !designationTableMissing/);
 assert.match(directory,/directoryResult\.error \|\| summaryResult\.error/);
});

test("Staff search updates list on partial input with debounce and no submit button",()=>{
 const search=read("src/features/staff/staff-directory-search.tsx");
 const page=read("src/app/staff/page.tsx");
 assert.match(page,/StaffDirectorySearch initialQuery=\{query\}/);
 assert.doesNotMatch(page,/<form action="\/staff" method="get"/);
 assert.match(search,/onChange=\{\(event\) => \{ latestQuery\.current = event\.target\.value; setQuery\(event\.target\.value\); \}\}/);
 assert.match(search,/setTimeout\(\(\) =>/);
 assert.match(search,/router\.replace\(/);
 assert.match(search,/scroll: false/);
 assert.match(search,/encodeURIComponent\(normalized\)/);
});

test("Academic Setup tolerates only an unapplied operational-designation migration",()=>{
 assert.match(hod,/operationalTableMissing/);
 assert.match(hod,/PGRST205/);
 assert.match(hod,/operationalDesignationsResult\.error && !operationalTableMissing/);
});

test("pre-migration preview disables HOD writes with explicit readiness feedback",()=>{
 const page=read("src/app/staff/page.tsx");
 assert.match(directory,/operationalHodReady: !designationTableMissing/);
 assert.match(page,/operationalHodReady=\{directory.operationalHodReady\}/);
 assert.match(ui,/!operationalHodReady \|\| hodPending/);
 assert.match(ui,/!operationalHodReady \|\| hodEndPending/);
 assert.match(ui,/HOD placement changes are unavailable until/);
});

test("live staff search guards against stale debounced navigation",()=>{
 const search=read("src/features/staff/staff-directory-search.tsx");
 assert.match(search,/latestQuery = useRef\(query\)/);
 assert.doesNotMatch(search,/lastNavigatedQuery/);
 assert.match(search,/latestQuery\.current\.trim\(\)/);
 assert.match(search,/normalized === initialQuery/);
});
