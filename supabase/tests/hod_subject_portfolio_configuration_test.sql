begin;

select plan(19);

select has_column(
  'public',
  'subject_department_responsibilities',
  'department_label',
  'HOD subject responsibilities expose an optional descriptive portfolio label'
);

select has_function(
  'public',
  'save_hod_subject_portfolio',
  array['uuid','uuid[]','uuid','text','date','date'],
  'grouped HOD portfolio save exists with a typed subject array'
);

select function_privs_are(
  'public',
  'save_hod_subject_portfolio',
  array['uuid','uuid[]','uuid','text','date','date'],
  'authenticated',
  array['EXECUTE'],
  'authenticated users can invoke the governed portfolio save'
);

select function_privs_are(
  'public',
  'save_hod_subject_portfolio',
  array['uuid','uuid[]','uuid','text','date','date'],
  'anon',
  array[]::text[],
  'anonymous users cannot invoke the portfolio save'
);

select ok(
  pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%subject_department_responsibilities%'
  and pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%p_subject_ids%',
  'portfolio save writes the canonical subject responsibility rows'
);

select ok(
  pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%user_current_school_matches%'
  and pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%has_school_role%',
  'portfolio save requires current-school leadership authority'
);

select ok(
  pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) not ilike '%platform_support%',
  'Platform Support is not granted portfolio configuration authority'
);

select ok(
  pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%tenant_id%'
  and pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%school_id%',
  'portfolio save verifies tenant and school scope'
);

select ok(
  pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%on conflict%'
  and pg_get_functiondef(
    'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
  ) ilike '%effective_to = excluded.effective_to%',
  'grouped save is idempotent for an existing effective responsibility'
);

select ok(
  not exists (
    select 1
    from pg_proc
    where oid = 'public.save_hod_subject_portfolio(uuid,uuid[],uuid,text,date,date)'::regprocedure
      and prosecdef
  ),
  'portfolio save does not bypass RLS with security definer'
);

-- Executable remediation coverage -------------------------------------------
-- Use a real current-school principal and an effective HOD placement. The
-- function remains security-invoker; its explicit current-school checks are
-- therefore exercised rather than bypassed by fixture setup.
set local session_replication_role = replica;

insert into public.tenants(id,name,slug)
values
  ('f5740000-0000-4000-8000-000000000001','Issue 574 Tenant','issue-574-tenant'),
  ('f5740000-0000-4000-8000-000000000002','Issue 574 Other Tenant','issue-574-other-tenant')
on conflict (id) do nothing;

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('f5740000-0000-4000-8000-000000000001','issue574-principal@example.test','authenticated','authenticated',now(),now()),
  ('f5740000-0000-4000-8000-000000000002','issue574-hod@example.test','authenticated','authenticated',now(),now())
on conflict (id) do nothing;

insert into public.schools(id,tenant_id,name,emis_number,status)
values
  ('f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001','Issue 574 School','F574-A','active'),
  ('f5740000-0000-4000-8000-000000000002','f5740000-0000-4000-8000-000000000002','Issue 574 Other School','F574-B','active')
on conflict (id) do nothing;

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values ('f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000002','F574-HOD','Issue','574 HOD','active')
on conflict (id) do nothing;

insert into public.school_memberships(id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001',null,'principal',current_date-10),
  ('f5740000-0000-4000-8000-000000000002','f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000002','f5740000-0000-4000-8000-000000000001','hod',current_date-10)
on conflict (id) do nothing;

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values ('f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001','management',current_date-10,'f5740000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name)
values
  ('f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001','f5740000-0000-4000-8000-000000000001','F574-A','Issue 574 Subject'),
  ('f5740000-0000-4000-8000-000000000002','f5740000-0000-4000-8000-000000000002','f5740000-0000-4000-8000-000000000002','F574-B','Other Subject')
on conflict (id) do nothing;

set local session_replication_role = origin;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f5740000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.save_hod_subject_portfolio(
    'f5740000-0000-4000-8000-000000000001'::uuid,
    array['f5740000-0000-4000-8000-000000000001']::uuid[],
    'f5740000-0000-4000-8000-000000000001'::uuid,
    'First label',
    current_date,
    null
  )$$,
  'principal can create a grouped portfolio responsibility'
);

select lives_ok(
  $$select public.save_hod_subject_portfolio(
    'f5740000-0000-4000-8000-000000000001'::uuid,
    array['f5740000-0000-4000-8000-000000000001']::uuid[],
    'f5740000-0000-4000-8000-000000000001'::uuid,
    'Updated label',
    current_date,
    current_date + 30
  )$$,
  'saving the same responsibility with a changed label succeeds'
);

select is(
  (select department_label from public.subject_department_responsibilities
   where school_id='f5740000-0000-4000-8000-000000000001'::uuid
     and subject_id='f5740000-0000-4000-8000-000000000001'::uuid),
  'Updated label',
  'descriptive department label is editable'
);

select is(
  (select effective_to from public.subject_department_responsibilities
   where school_id='f5740000-0000-4000-8000-000000000001'::uuid
     and subject_id='f5740000-0000-4000-8000-000000000001'::uuid),
  current_date + 30,
  'effective_to remains editable for ending responsibility'
);

select throws_ok(
  $$update public.subject_department_responsibilities
    set subject_id='f5740000-0000-4000-8000-000000000002'::uuid
    where school_id='f5740000-0000-4000-8000-000000000001'::uuid$$,
  '23514',
  'HOD responsibility provenance is immutable; end the row and create a new responsibility',
  'changing the subject provenance is rejected'
);

select throws_ok(
  $$update public.subject_department_responsibilities
    set department_head_staff_assignment_id='f5740000-0000-4000-8000-000000000002'::uuid
    where school_id='f5740000-0000-4000-8000-000000000001'::uuid$$,
  '23514',
  'HOD responsibility provenance is immutable; end the row and create a new responsibility',
  'changing the HOD provenance is rejected'
);

select throws_ok(
  $$update public.subject_department_responsibilities
    set school_id='f5740000-0000-4000-8000-000000000002'::uuid
    where school_id='f5740000-0000-4000-8000-000000000001'::uuid$$,
  '23514',
  'HOD responsibility provenance is immutable; end the row and create a new responsibility',
  'changing the school provenance is rejected'
);

select throws_ok(
  $$update public.subject_department_responsibilities
    set tenant_id='f5740000-0000-4000-8000-000000000002'::uuid
    where school_id='f5740000-0000-4000-8000-000000000001'::uuid$$,
  '23514',
  'HOD responsibility provenance is immutable; end the row and create a new responsibility',
  'changing the tenant provenance is rejected'
);

select throws_ok(
  $$update public.subject_department_responsibilities
    set effective_from=current_date + 1
    where school_id='f5740000-0000-4000-8000-000000000001'::uuid$$,
  '23514',
  'HOD responsibility provenance is immutable; end the row and create a new responsibility',
  'changing effective_from provenance is rejected'
);

select * from finish();
rollback;