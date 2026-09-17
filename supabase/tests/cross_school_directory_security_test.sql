begin;

select plan(34);

-- ==========================================================================
-- Fixtures: tenant A with two schools, tenant B with one school.
-- ==========================================================================
insert into public.tenants(id, name, slug) values
  ('cd1f1111-1111-4111-8111-111111111111', 'Directory Tenant A', 'directory-tenant-a'),
  ('cd1f2222-2222-4222-8222-222222222222', 'Directory Tenant B', 'directory-tenant-b');

insert into public.schools(id, tenant_id, name, emis_number, region, town)
values
  ('cd100000-0000-4000-8000-000000000001', 'cd1f1111-1111-4111-8111-111111111111', 'Alpha Directory School', '90001', 'Erongo', 'Swakopmund'),
  ('cd100000-0000-4000-8000-000000000002', 'cd1f1111-1111-4111-8111-111111111111', 'Beta Directory School', '90002', 'Erongo', 'Walvis Bay'),
  ('cd100000-0000-4000-8000-000000000003', 'cd1f2222-2222-4222-8222-222222222222', 'Gamma Other-Tenant School', '90003', 'Oshana', 'Oshakati');

insert into auth.users(id, email, aud, role, created_at, updated_at) values
  ('cd200000-0000-4000-8000-000000000001', 'dir-admin-a@example.test', 'authenticated', 'authenticated', now(), now()),
  ('cd200000-0000-4000-8000-000000000002', 'dir-admin-b@example.test', 'authenticated', 'authenticated', now(), now()),
  ('cd200000-0000-4000-8000-000000000003', 'dir-teacher-a@example.test', 'authenticated', 'authenticated', now(), now()),
  ('cd200000-0000-4000-8000-000000000004', 'dir-support@example.test', 'authenticated', 'authenticated', now(), now()),
  ('cd200000-0000-4000-8000-000000000005', 'dir-stale-principal@example.test', 'authenticated', 'authenticated', now(), now());

-- Principal of Alpha: placement history INCLUDING a current effective row.
-- Principal of Beta: membership active but placement ENDED (stale principal).
insert into public.staff_members(id, tenant_id, user_id, employee_number, first_name, last_name, status)
values
  ('cd300000-0000-4000-8000-000000000001', 'cd1f1111-1111-4111-8111-111111111111', null, 'DIR-EMP-1', 'Prin', 'Cipal', 'active'),
  ('cd300000-0000-4000-8000-000000000003', 'cd1f1111-1111-4111-8111-111111111111', 'cd200000-0000-4000-8000-000000000005', 'DIR-EMP-3', 'Ended', 'Placement', 'active');

insert into public.staff_school_assignments(
  tenant_id, school_id, staff_member_id, assignment_type, position_title, effective_from, effective_to, created_by_user_id
) values
  ('cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000001', 'cd300000-0000-4000-8000-000000000001', 'management', 'Principal', current_date - 400, null, 'cd200000-0000-4000-8000-000000000001'),
  ('cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000002', 'cd300000-0000-4000-8000-000000000003', 'management', 'Principal', current_date - 400, current_date - 30, 'cd200000-0000-4000-8000-000000000002');

insert into public.school_memberships(tenant_id, school_id, user_id, staff_member_id, role_key, active_from) values
  ('cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000001', 'cd200000-0000-4000-8000-000000000001', 'cd300000-0000-4000-8000-000000000001', 'principal', current_date - 100),
  ('cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000002', 'cd200000-0000-4000-8000-000000000002', null, 'school_admin', current_date - 100),
  ('cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000001', 'cd200000-0000-4000-8000-000000000003', null, 'teacher', current_date - 100),
  ('cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000002', 'cd200000-0000-4000-8000-000000000005', 'cd300000-0000-4000-8000-000000000003', 'principal', current_date - 100);

insert into public.platform_memberships(user_id, role_key, active_from)
values ('cd200000-0000-4000-8000-000000000004', 'platform_support', current_date - 100);

-- Network: one authority, one region, two circuits. Beta's assignment ENDED
-- (stale); Gamma has none. Only Alpha holds a current assignment.
insert into public.education_authorities(id, name)
values ('cd400000-0000-4000-8000-000000000009', 'Erongo Education Authority');
insert into public.education_regions(id, name)
values ('cd400000-0000-4000-8000-000000000001', 'Erongo Region');
insert into public.education_circuits(id, name)
values
  ('cd400000-0000-4000-8000-000000000002', 'Swakopmund Circuit'),
  ('cd400000-0000-4000-8000-000000000003', 'Walvis Bay Circuit');

insert into public.school_network_assignments(
  school_id, authority_id, region_id, circuit_id, effective_from, effective_to
) values
  ('cd100000-0000-4000-8000-000000000001', 'cd400000-0000-4000-8000-000000000009', 'cd400000-0000-4000-8000-000000000001', 'cd400000-0000-4000-8000-000000000002', current_date - 200, null),
  ('cd100000-0000-4000-8000-000000000002', 'cd400000-0000-4000-8000-000000000009', 'cd400000-0000-4000-8000-000000000001', 'cd400000-0000-4000-8000-000000000003', current_date - 400, current_date - 90);

-- Alpha document_profile: pre-existing keys must survive contact merges.
insert into public.school_settings(school_id, setting_key, setting_value)
values ('cd100000-0000-4000-8000-000000000001', 'document_profile', '{"telephone":"+264 64 000 000","fax":"+264 64 000 001","email":"office@alpha.test","physical_address":"1 Main Street","postal_address":"P O Box 1","logo_url":"https://cdn.example.test/logo.png","former_name":"Old Alpha"}'::jsonb);

insert into public.academic_years(id, tenant_id, school_id, year, status, starts_on, ends_on)
values ('cd600000-0000-4000-8000-000000000001', 'cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000001', 2026, 'active', current_date - 30, null),
       ('cd600000-0000-4000-8000-000000000002', 'cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000002', 2026, 'active', current_date - 30, null);

-- Grades for Alpha (8 and 12) and Beta (1 and 7).
insert into public.grades(id, tenant_id, school_id, academic_year, grade_code, display_name)
values
  ('cd500000-0000-4000-8000-000000000001', 'cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000001', 2026, '8', 'Grade 8'),
  ('cd500000-0000-4000-8000-000000000002', 'cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000001', 2026, '12', 'Grade 12'),
  ('cd500000-0000-4000-8000-000000000003', 'cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000002', 2026, '1', 'Grade 1'),
  ('cd500000-0000-4000-8000-000000000004', 'cd1f1111-1111-4111-8111-111111111111', 'cd100000-0000-4000-8000-000000000002', 2026, '7', 'Grade 7');

-- ==========================================================================
-- R1: authenticated school A can find school B directory row
-- ==========================================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cd200000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.search_school_directory() where school_id = 'cd100000-0000-4000-8000-000000000002'),
  1,
  'R1 school A sees school B in the directory'
);

select is(
  (select count(*)::integer from public.search_school_directory()),
  3,
  'all onboarded active-school tenants are directory-visible including circuit-less schools'
);

select is(
  (select count(*)::integer from public.search_school_directory(p_search := 'alpha')),
  1,
  'search matches school name case-insensitively'
);

select is(
  (select count(*)::integer from public.search_school_directory(p_search := '90002')),
  1,
  'search matches EMIS number'
);

select is(
  (select count(*)::integer from public.search_school_directory(p_circuit_id := 'cd400000-0000-4000-8000-000000000002')),
  1,
  'circuit filter returns only currently-assigned schools'
);

select is(
  (select count(*)::integer from public.search_school_directory(p_region_id := 'cd400000-0000-4000-8000-000000000001')),
  1,
  'region filter resolves through the CURRENT network assignment only'
);

-- R17: only the CURRENT assignment is shown (Beta's ended assignment must not surface).
select is(
  (select circuit_name is null from public.search_school_directory() where school_id = 'cd100000-0000-4000-8000-000000000002'),
  true,
  'R17 ended network assignment is not shown as current circuit'
);

-- R18: historical assignment remains intact.
select is(
  (select count(*)::integer from public.school_network_assignments where school_id = 'cd100000-0000-4000-8000-000000000002'),
  1,
  'R18 historical network assignment is preserved'
);

-- R16: directory output is the fixed allowlisted column set, never settings JSON.
select is(
  (select (select count(*) from jsonb_object_keys(to_jsonb(d))) from public.search_school_directory() d limit 1),
  26,
  'R16 directory rows expose exactly the 26 allowlisted columns'
);

select is(
  (select count(*)::integer
   from public.search_school_directory() d,
        jsonb_object_keys(to_jsonb(d)) k
   where k ilike '%setting%' or k ilike '%profile%' or k ilike '%learner%'
      or k ilike '%staff%' or k ilike '%employee%' or k ilike '%user%'),
  0,
  'R16/R5 directory output exposes no settings/profile/learner/staff/identity keys'
);

-- ==========================================================================
-- R4/R5: principal resolution is placement-aware; private data never exposed.
-- ==========================================================================
select is(
  (select principal_name from public.search_school_directory() where school_id = 'cd100000-0000-4000-8000-000000000001'),
  'Prin Cipal',
  'current effective principal is resolved live'
);

select is(
  (select principal_name is null from public.search_school_directory() where school_id = 'cd100000-0000-4000-8000-000000000002'),
  true,
  'R4 stale/ended principal placement does not resurrect via stale membership'
);

-- Grades derivation: 8 and 12 => "8–12".
select is(
  (select grades_offered_display from public.search_school_directory() where school_id = 'cd100000-0000-4000-8000-000000000001'),
  '8–12',
  'grades offered display derives a truthful numeric range'
);

-- R5: the RPC surface itself carries no staff-identity parameters or output.
select is(
  (select position('employee' in pg_get_functiondef('public.search_school_directory(text,uuid,uuid)'::regprocedure)) > 0),
  false,
  'R5 directory RPC definition contains no employee-number surface'
);

-- ==========================================================================
-- R6: anon cannot execute the directory RPC.
-- ==========================================================================
reset role;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  'select * from public.search_school_directory()',
  '42501',
  'permission denied for function search_school_directory',
  'R6 anon cannot execute the directory RPC'
);

-- ==========================================================================
-- Own-school public contact fields (merge semantics).
-- ==========================================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cd200000-0000-4000-8000-000000000001', true);

select public.set_school_directory_contact(
  'cd100000-0000-4000-8000-000000000001',
  '+264 81 000 0000',
  'principal.public@alpha.test'
);

select is(
  (select school_cellphone from public.search_school_directory() where school_id = 'cd100000-0000-4000-8000-000000000001'),
  '+264 81 000 0000',
  'school cellphone publishes through the merge RPC'
);

select is(
  (select principal_public_email from public.search_school_directory() where school_id = 'cd100000-0000-4000-8000-000000000001'),
  'principal.public@alpha.test',
  'principal public email publishes through the merge RPC'
);

-- Pre-existing document_profile keys survive the merge (no wholesale replacement).
select is(
  (select (setting_value ->> 'logo_url') from public.school_settings where school_id = 'cd100000-0000-4000-8000-000000000001' and setting_key = 'document_profile'),
  'https://cdn.example.test/logo.png',
  'merge preserves unrelated existing document_profile keys'
);

select is(
  (select (setting_value ->> 'former_name') from public.school_settings where school_id = 'cd100000-0000-4000-8000-000000000001' and setting_key = 'document_profile'),
  'Old Alpha',
  'merge preserves former_name used by document rendering'
);

-- Invalid public email is rejected.
select throws_ok(
  'select public.set_school_directory_contact(''cd100000-0000-4000-8000-000000000001'', null, ''not-an-email'')',
  'P0001',
  'Principal public email must be a valid email address',
  'principal public email is syntactically validated'
);

-- R7/R8 boundary: other users cannot mutate school A settings through the RPC.
select set_config('request.jwt.claim.sub', 'cd200000-0000-4000-8000-000000000002', true);
select throws_ok(
  'select public.set_school_directory_contact(''cd100000-0000-4000-8000-000000000001'', ''+264 81 999 9999'', null)',
  'P0001',
  'Not authorised to manage school settings',
  'R7 cross-school settings mutation is denied'
);

select set_config('request.jwt.claim.sub', 'cd200000-0000-4000-8000-000000000003', true);
select throws_ok(
  'select public.set_school_directory_contact(''cd100000-0000-4000-8000-000000000001'', ''+264 81 888 8888'', null)',
  'P0001',
  'Not authorised to manage school settings',
  'R8 ordinary user cannot mutate own-school settings'
);

-- ==========================================================================
-- Inspector contact write authority.
-- ==========================================================================
select set_config('request.jwt.claim.sub', 'cd200000-0000-4000-8000-000000000001', true);
select public.update_circuit_inspector_contact(
  'cd400000-0000-4000-8000-000000000002',
  'Jane Inspector',
  '+264 81 111 1111',
  'inspector@education.test'
);

select is(
  (select inspector_name from public.search_school_directory() where school_id = 'cd100000-0000-4000-8000-000000000001'),
  'Jane Inspector',
  'R9 same-circuit authority can update inspector contact'
);

select is(
  (select inspector_last_updated_by_school_name from public.search_school_directory() where school_id = 'cd100000-0000-4000-8000-000000000001'),
  'Alpha Directory School',
  'last-updated attribution is school-level only'
);

select is(
  (select inspector_updated_at is not null from public.education_circuits where id = 'cd400000-0000-4000-8000-000000000002'),
  true,
  'inspector update stamps provenance timestamp'
);

select is(
  (select name from public.education_circuits where id = 'cd400000-0000-4000-8000-000000000002'),
  'Swakopmund Circuit',
  'R14 inspector update preserves circuit identity'
);

-- R10: circuit A school cannot update circuit B.
select throws_ok(
  'select public.update_circuit_inspector_contact(''cd400000-0000-4000-8000-000000000003'', ''X'', null, null)',
  'P0001',
  'Your school does not hold a current assignment to this circuit',
  'R10 wrong-circuit update is denied'
);

-- R13: platform support has no school-operational authority.
select set_config('request.jwt.claim.sub', 'cd200000-0000-4000-8000-000000000004', true);
select throws_ok(
  'select public.update_circuit_inspector_contact(''cd400000-0000-4000-8000-000000000002'', ''Support'', null, null)',
  'P0001',
  'Current School Settings authority is required to update circuit inspector contact',
  'R13 platform support cannot update circuit contact'
);

-- R11: stale placement principal cannot update even the circuit it once belonged to.
select set_config('request.jwt.claim.sub', 'cd200000-0000-4000-8000-000000000005', true);
select throws_ok(
  'select public.update_circuit_inspector_contact(''cd400000-0000-4000-8000-000000000003'', ''Stale'', null, null)',
  'P0001',
  'Effective school placement is required to update circuit inspector contact',
  'R11 stale placement cannot update inspector contact'
);

-- R12: a school whose circuit assignment ENDED cannot reach its own historical circuit.
select set_config('request.jwt.claim.sub', 'cd200000-0000-4000-8000-000000000002', true);
select throws_ok(
  'select public.update_circuit_inspector_contact(''cd400000-0000-4000-8000-000000000003'', ''Stale'', null, null)',
  'P0001',
  'Your school does not hold a current assignment to this circuit',
  'R12 non-current school/circuit pairing is denied'
);

-- R2/R3: directory does not broaden underlying table access.
select set_config('request.jwt.claim.sub', 'cd200000-0000-4000-8000-000000000001', true);
select is(
  (select count(*)::integer from public.school_settings where school_id = 'cd100000-0000-4000-8000-000000000002'),
  0,
  'R2 school A cannot SELECT school B school_settings rows'
);

select is(
  (select count(*)::integer from public.enrolments where school_id = 'cd100000-0000-4000-8000-000000000002'),
  0,
  'R3 school A cannot read school B learner enrolment data'
);

select is(
  (select count(*)::integer from public.staff_members where id = 'cd300000-0000-4000-8000-000000000003'),
  0,
  'R4 school A cannot read school B staff rows'
);

-- R15: directory never returns banking/payment settings.
select is(
  (select count(*)::integer
   from public.search_school_directory() d
   where to_jsonb(d)::text ilike '%bank%' or to_jsonb(d)::text ilike '%payment%'),
  0,
  'R15 directory output contains no banking/payment fields'
);

-- Existing education network audit trail captured the inspector mutation.
select is(
  (select count(*)::integer from public.education_network_audit_events
   where table_name = 'education_circuits'
     and row_id = 'cd400000-0000-4000-8000-000000000002'
     and action = 'UPDATE'
     and new_data ->> 'inspector_name' = 'Jane Inspector'),
  1,
  'inspector contact edits are captured by the existing network audit trail'
);

select * from finish();
rollback;
