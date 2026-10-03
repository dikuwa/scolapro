begin;

select plan(10);

select has_function(
  'public',
  'bulk_create_subject_offerings',
  array['uuid','integer','uuid[]','uuid[]','smallint'],
  'bulk offering RPC remains available after concurrency remediation'
);

select has_function(
  'public',
  'bulk_create_teacher_allocations',
  array['uuid','integer','uuid[]','uuid[]','uuid[]','uuid','date','date'],
  'bulk teacher allocation RPC remains available after overlap remediation'
);

insert into public.tenants(id,name,slug)
values(
  'fe000000-0000-4000-8000-000000000001',
  'Bulk Remediation Tenant',
  'bulk-remediation-tenant'
);

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values(
  'fe010000-0000-4000-8000-000000000001',
  'fe000000-0000-4000-8000-000000000001',
  'Bulk Remediation School',
  'BR-001',
  'Erongo',
  'Swakopmund'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values(
  'fe020000-0000-4000-8000-000000000001',
  'bulk-remediation-admin@example.test',
  'authenticated',
  'authenticated',
  now(),
  now()
);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,role_key,active_from
) values(
  'fe030000-0000-4000-8000-000000000001',
  'fe000000-0000-4000-8000-000000000001',
  'fe010000-0000-4000-8000-000000000001',
  'fe020000-0000-4000-8000-000000000001',
  'school_admin',
  '2026-01-01'
);

insert into public.grades(
  id,tenant_id,school_id,academic_year,grade_code,display_name
) values(
  'fe040000-0000-4000-8000-000000000001',
  'fe000000-0000-4000-8000-000000000001',
  'fe010000-0000-4000-8000-000000000001',
  2026,
  'G8',
  'Grade 8'
);

insert into public.register_classes(
  id,tenant_id,school_id,grade_id,academic_year,class_code,display_name
) values(
  'fe050000-0000-4000-8000-000000000001',
  'fe000000-0000-4000-8000-000000000001',
  'fe010000-0000-4000-8000-000000000001',
  'fe040000-0000-4000-8000-000000000001',
  2026,
  '8A',
  '8A'
);

insert into public.subjects(
  id,tenant_id,school_id,subject_code,display_name,status
) values(
  'fe060000-0000-4000-8000-000000000001',
  'fe000000-0000-4000-8000-000000000001',
  'fe010000-0000-4000-8000-000000000001',
  'BR-MATH',
  'Bulk Remediation Mathematics',
  'active'
);

insert into public.staff_members(
  id,tenant_id,employee_number,first_name,last_name,status
) values(
  'fe070000-0000-4000-8000-000000000001',
  'fe000000-0000-4000-8000-000000000001',
  'BR-T01',
  'Bulk',
  'Remediation',
  'active'
);

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,
  effective_from,effective_to,created_by_user_id
) values(
  'fe080000-0000-4000-8000-000000000001',
  'fe000000-0000-4000-8000-000000000001',
  'fe010000-0000-4000-8000-000000000001',
  'fe070000-0000-4000-8000-000000000001',
  'teacher',
  '2026-01-01',
  null,
  'fe020000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe020000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (
    select concat_ws(':',r->>'created',r->>'existing')
    from (
      select public.bulk_create_subject_offerings(
        'fe010000-0000-4000-8000-000000000001',
        2026,
        array['fe060000-0000-4000-8000-000000000001'::uuid],
        array['fe040000-0000-4000-8000-000000000001'::uuid],
        5::smallint
      ) r
    ) q
  ),
  '1:0',
  'first bulk offering request atomically creates the canonical row'
);

select is(
  (
    select concat_ws(':',r->>'created',r->>'existing')
    from (
      select public.bulk_create_subject_offerings(
        'fe010000-0000-4000-8000-000000000001',
        2026,
        array['fe060000-0000-4000-8000-000000000001'::uuid],
        array['fe040000-0000-4000-8000-000000000001'::uuid],
        9::smallint
      ) r
    ) q
  ),
  '0:1',
  'repeat offering request reports the existing combination without rewriting it'
);

select is(
  (
    select periods_per_cycle
    from public.subject_offerings
    where school_id='fe010000-0000-4000-8000-000000000001'
      and academic_year=2026
      and subject_id='fe060000-0000-4000-8000-000000000001'
      and grade_id='fe040000-0000-4000-8000-000000000001'
  ),
  5::smallint,
  'existing periods target remains unchanged'
);

select is(
  (
    select concat_ws(':',r->>'created',r->>'duplicates',r->>'conflicts')
    from (
      select public.bulk_create_teacher_allocations(
        'fe010000-0000-4000-8000-000000000001',
        2026,
        array[
          (
            select id
            from public.subject_offerings
            where school_id='fe010000-0000-4000-8000-000000000001'
              and subject_id='fe060000-0000-4000-8000-000000000001'
              and grade_id='fe040000-0000-4000-8000-000000000001'
          )
        ],
        array['fe050000-0000-4000-8000-000000000001'::uuid],
        '{}'::uuid[],
        'fe070000-0000-4000-8000-000000000001',
        '2026-02-01',
        '2026-06-30'
      ) r
    ) q
  ),
  '1:0:0',
  'first bulk teacher allocation creates the canonical effective period'
);

select is(
  (
    select concat_ws(':',r->>'created',r->>'duplicates',r->>'conflicts')
    from (
      select public.bulk_create_teacher_allocations(
        'fe010000-0000-4000-8000-000000000001',
        2026,
        array[
          (
            select id
            from public.subject_offerings
            where school_id='fe010000-0000-4000-8000-000000000001'
              and subject_id='fe060000-0000-4000-8000-000000000001'
              and grade_id='fe040000-0000-4000-8000-000000000001'
          )
        ],
        array['fe050000-0000-4000-8000-000000000001'::uuid],
        '{}'::uuid[],
        'fe070000-0000-4000-8000-000000000001',
        '2026-02-01',
        '2026-06-30'
      ) r
    ) q
  ),
  '0:1:0',
  'exact repeat is classified as a duplicate'
);

select is(
  (
    select concat_ws(':',r->>'created',r->>'duplicates',r->>'conflicts')
    from (
      select public.bulk_create_teacher_allocations(
        'fe010000-0000-4000-8000-000000000001',
        2026,
        array[
          (
            select id
            from public.subject_offerings
            where school_id='fe010000-0000-4000-8000-000000000001'
              and subject_id='fe060000-0000-4000-8000-000000000001'
              and grade_id='fe040000-0000-4000-8000-000000000001'
          )
        ],
        array['fe050000-0000-4000-8000-000000000001'::uuid],
        '{}'::uuid[],
        'fe070000-0000-4000-8000-000000000001',
        '2026-03-01',
        '2026-09-30'
      ) r
    ) q
  ),
  '0:0:1',
  'different start date with an overlapping effective range is reported as a conflict'
);

select is(
  (
    select count(*)::integer
    from public.teacher_allocations
    where school_id='fe010000-0000-4000-8000-000000000001'
      and subject_offering_id=(
        select id
        from public.subject_offerings
        where school_id='fe010000-0000-4000-8000-000000000001'
          and subject_id='fe060000-0000-4000-8000-000000000001'
          and grade_id='fe040000-0000-4000-8000-000000000001'
      )
      and register_class_id='fe050000-0000-4000-8000-000000000001'
      and staff_member_id='fe070000-0000-4000-8000-000000000001'
  ),
  1,
  'overlap conflict does not create a second canonical teacher allocation'
);

select is(
  (
    select concat_ws(':',r->>'created',r->>'duplicates',r->>'conflicts')
    from (
      select public.bulk_create_teacher_allocations(
        'fe010000-0000-4000-8000-000000000001',
        2026,
        array[
          (
            select id
            from public.subject_offerings
            where school_id='fe010000-0000-4000-8000-000000000001'
              and subject_id='fe060000-0000-4000-8000-000000000001'
              and grade_id='fe040000-0000-4000-8000-000000000001'
          )
        ],
        array['fe050000-0000-4000-8000-000000000001'::uuid],
        '{}'::uuid[],
        'fe070000-0000-4000-8000-000000000001',
        '2026-07-01',
        '2026-12-31'
      ) r
    ) q
  ),
  '1:0:0',
  'a range starting after the existing allocation ends is not treated as overlapping'
);

select * from finish();
rollback;
