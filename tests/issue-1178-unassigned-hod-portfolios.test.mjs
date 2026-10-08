import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (p) => readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261008011328_unassigned_hod_subject_portfolios.sql');
const actions=read('src/features/academics/server/hod-scope-actions.ts');
const query=read('src/features/academics/server/hod-scope.ts');
const ui=read('src/features/academics/hod-scope-configuration.tsx');
test('unassigned portfolio stores subject scope without HOD grant',()=>{
 assert.match(migration,/create table public.hod_subject_portfolios/);
 assert.match(migration,/subject_ids uuid\[\] not null/);
 assert.doesNotMatch(migration.slice(migration.indexOf('create table public.hod_subject_portfolios'),migration.indexOf('create table public.hod_portfolio_appointments')),/staff_assignment_id/);
 assert.match(migration,/create_unassigned_hod_portfolio/);
});
test('appointments are independent effective dated records and populate existing authorization source',()=>{
 assert.match(migration,/create table public.hod_portfolio_appointments/);
 assert.match(migration,/insert into public.subject_department_responsibilities/);
 assert.match(migration,/update public.subject_department_responsibilities set effective_to=/);
 assert.match(migration,/where portfolio_appointment_id=v_prev.id and effective_to is null/);
 assert.match(migration,/guard_hod_portfolio_responsibility_link/);
 assert.match(migration,/guard_hod_portfolio_appointment_history/);
});
test('HOD-only cannot self-appoint; school leaders retain the boundary',()=>{
 assert.match(migration,/has_school_role\(v_port.school_id,array\['school_admin','principal','deputy_principal'\]\)/);
 assert.match(actions,/canConfigureSchool\(parsed.data.schoolId\)/);
 assert.match(migration,/Effective HOD placement required/);
 assert.match(migration,/security definer set search_path=pg_catalog,public,app_private/);
});
test('Academic setup offers create-now assign-later with displayed history',()=>{
 assert.match(ui,/Create unassigned portfolio/);
 assert.match(ui,/Assign HOD later/);
 assert.match(ui,/Unassigned/);
 assert.match(ui,/portfolio.appointments.map/);
 assert.match(query,/hod_portfolio_appointments/);
 assert.match(actions,/appoint_hod_portfolio/);
});
