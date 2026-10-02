begin;

select plan(19);

select has_function(
  'public',
  'get_timetable_curriculum_demand_matrix',
  array['uuid','integer','date'],
  'curriculum demand matrix RPC exists'
);

select is(
  has_function_privilege(
    'anon',
    'public.get_timetable_curriculum_demand_matrix(uuid,integer,date)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot read timetable curriculum demand'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.get_timetable_curriculum_demand_matrix(uuid,integer,date)',
    'EXECUTE'
  ),
  true,
  'authenticated school users can invoke the guarded demand matrix'
);

insert into public.tenants(id,name,slug)
values(
  'f6000000-0000-4000-8000-000000000001',
  'Demand Matrix Tenant',
  'demand-matrix-tenant'
);

insert into public.schools(
  id,tenant_id,name,emis_number,region,town,timetable_cycle_mode,timetable_cycle_length
)
values(
  'f6010000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000001',
  'Demand Matrix School',
  'DM-001',
  'Erongo',
  'Swakopmund',
  'rotating',
  7
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f6020000-0000-4000-8000-000000000001','demand-platform@example.test','authenticated','authenticated',now(),now()),
  ('f6020000-0000-4000-8000-000000000002','demand-admin@example.test','authenticated','authenticated',now(),now()),
  ('f6020000-0000-4000-8000-000000000003','demand-hod@example.test','authenticated','authenticated',now(),now()),
  ('f6020000-0000-4000-8000-000000000004','demand-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values(
  'f6020000-0000-4000-8000-000000000001',
  'platform_admin',
  current_date-10
);

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,role_key,active_from
) values
  (
    'f6030000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000001',
    'f6010000-0000-4000-8000-000000000001',
    'f6020000-0000-4000-8000-000000000002',
    'school_admin',
    current_date-10
  ),
  (
    'f6030000-0000-4000-8000-000000000002',
    'f6000000-0000-4000-8000-000000000001',
    'f6010000-0000-4000-8000-000000000001',
    'f6020000-0000-4000-8000-000000000003',
    'hod',
    current_date-10
  ),
  (
    'f6030000-0000-4000-8000-000000000003',
    'f6000000-0000-4000-8000-000000000001',
    'f6010000-0000-4000-8000-000000000001',
    'f6020000-0000-4000-8000-000000000004',
    'teacher',
    current_date-10
  );

insert into public.grades(
  id,tenant_id,school_id,academic_year,grade_code,display_name
)
values(
  'f6040000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000001',
  'f6010000-0000-4000-8000-000000000001',
  2026,
  'G9',
  'Grade 9'
);

insert into public.register_classes(
  id,tenant_id,school_id,grade_id,academic_year,class_code,display_name
) values
  ('f6050000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001','f6040000-0000-4000-8000-000000000001',2026,'9A','9A'),
  ('f6050000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001','f6040000-0000-4000-8000-000000000001',2026,'9B','9B'),
  ('f6050000-0000-4000-8000-000000000003','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001','f6040000-0000-4000-8000-000000000001',2026,'9C','9C'),
  ('f6050000-0000-4000-8000-000000000004','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001','f6040000-0000-4000-8000-000000000001',2026,'9D','9D'),
  ('f6050000-0000-4000-8000-000000000005','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001','f6040000-0000-4000-8000-000000000001',2026,'9E','9E'),
  ('f6050000-0000-4000-8000-000000000006','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001','f6040000-0000-4000-8000-000000000001',2026,'9F','9F'),
  ('f6050000-0000-4000-8000-000000000007','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001','f6040000-0000-4000-8000-000000000001',2026,'9G','9G'),
  ('f6050000-0000-4000-8000-000000000008','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001','f6040000-0000-4000-8000-000000000001',2026,'9H','9H');

insert into public.subjects(
  id,tenant_id,school_id,subject_code,display_name,status
)
select
  ('f6060000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f6000000-0000-4000-8000-000000000001'::uuid,
  'f6010000-0000-4000-8000-000000000001'::uuid,
  'DM-'||n,
  'Demand Subject '||n,
  'active'
from generate_series(1,8) n;

insert into public.subject_offerings(
  id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status
)
select
  ('f6070000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f6000000-0000-4000-8000-000000000001'::uuid,
  'f6010000-0000-4000-8000-000000000001'::uuid,
  2026,
  ('f6060000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f6040000-0000-4000-8000-000000000001'::uuid,
  case when n=4 then 3 when n in (6,7,8) then 2 else 4 end,
  'active'
from generate_series(1,8) n;

insert into public.staff_members(
  id,tenant_id,employee_number,first_name,last_name,status
)
select
  ('f6080000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f6000000-0000-4000-8000-000000000001'::uuid,
  'DM-T'||n,
  'Demand',
  'Teacher '||n,
  'active'
from generate_series(1,9) n;

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
)
select
  ('f6090000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f6000000-0000-4000-8000-000000000001'::uuid,
  'f6010000-0000-4000-8000-000000000001'::uuid,
  ('f6080000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'teacher',
  '2026-01-01'::date,
  '2026-12-31'::date,
  'f6020000-0000-4000-8000-000000000002'::uuid
from generate_series(1,9) n;

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to
)
select
  ('f60a0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f6000000-0000-4000-8000-000000000001'::uuid,
  'f6010000-0000-4000-8000-000000000001'::uuid,
  2026,
  ('f6070000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('f6050000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('f6080000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '2026-01-01'::date,
  case when n=1 then '2026-06-30'::date else '2026-12-31'::date end
from generate_series(1,8) n;

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to
) values(
  'f60a0000-0000-4000-8000-000000000009',
  'f6000000-0000-4000-8000-000000000001',
  'f6010000-0000-4000-8000-000000000001',
  2026,
  'f6070000-0000-4000-8000-000000000001',
  'f6050000-0000-4000-8000-000000000001',
  'f6080000-0000-4000-8000-000000000009',
  '2026-07-01',
  '2026-12-31'
);

insert into public.timetable_periods(
  id,tenant_id,school_id,academic_year,period_number,display_name,is_teaching_period
) values
  ('f60b0000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001',2026,1,'P1',true),
  ('f60b0000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001',2026,2,'P2',true),
  ('f60b0000-0000-4000-8000-000000000003','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001',2026,3,'Break',false),
  ('f60b0000-0000-4000-8000-000000000004','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001',2026,4,'P3',true),
  ('f60b0000-0000-4000-8000-000000000005','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001',2026,5,'Break 2',false),
  ('f60b0000-0000-4000-8000-000000000006','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001',2026,6,'P4',true),
  ('f60b0000-0000-4000-8000-000000000007','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001',2026,7,'Break 3',false),
  ('f60b0000-0000-4000-8000-000000000008','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001',2026,8,'P5',true),
  ('f60b0000-0000-4000-8000-000000000009','f6000000-0000-4000-8000-000000000001','f6010000-0000-4000-8000-000000000001',2026,9,'P6',true);

insert into public.curriculum_sources(
  id,authority,source_key,title,source_url,checksum,provenance,status
) values(
  'f60c0000-0000-4000-8000-000000000001',
  'NIED',
  'demand-matrix-source',
  'Demand Matrix Official Source',
  'https://example.test/demand-matrix.pdf',
  'sha256:demand-matrix',
  '{"fixture":"demand-matrix"}'::jsonb,
  'verified'
);

insert into public.curriculum_subjects(
  id,curriculum_key,display_name,phase_code,subject_code,authority,active
) values
  ('f60d0000-0000-4000-8000-000000000001','demand-main','Demand Main','junior_secondary','DMMAIN','NIED',true),
  ('f60d0000-0000-4000-8000-000000000002','demand-missing','Demand Missing','junior_secondary','DMMISS','NIED',true),
  ('f60d0000-0000-4000-8000-000000000003','demand-cycle','Demand Cycle','junior_secondary','DMCYCLE','NIED',true),
  ('f60d0000-0000-4000-8000-000000000004','demand-conflict','Demand Conflict','junior_secondary','DMCONFLICT','NIED',true);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6020000-0000-4000-8000-000000000002',true);

insert into public.school_subject_curriculum_mappings(
  id,tenant_id,school_id,subject_id,curriculum_subject_id,grade_code,phase_code,
  effective_from_year,effective_to_year,status,created_by_user_id
)
select
  ('f60e0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f6000000-0000-4000-8000-000000000001'::uuid,
  'f6010000-0000-4000-8000-000000000001'::uuid,
  ('f6060000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case
    when n<=5 then 'f60d0000-0000-4000-8000-000000000001'::uuid
    when n=6 then 'f60d0000-0000-4000-8000-000000000002'::uuid
    when n=7 then 'f60d0000-0000-4000-8000-000000000003'::uuid
    else 'f60d0000-0000-4000-8000-000000000004'::uuid
  end,
  'G9',
  'junior_secondary',
  2026,
  2026,
  'verified',
  'f6020000-0000-4000-8000-000000000002'::uuid
from generate_series(1,8) n;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f6020000-0000-4000-8000-000000000001',true);
set local role authenticated;

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  total_periods_per_cycle,effective_from_year,effective_to_year,status,provenance
) values
  ('f60f0000-0000-4000-8000-000000000001','f60c0000-0000-4000-8000-000000000001','demand-7day','Demand 7-day','junior_secondary','rotating',7,40,56,2026,2026,'draft','{"locator":"main"}'::jsonb),
  ('f60f0000-0000-4000-8000-000000000002','f60c0000-0000-4000-8000-000000000001','demand-5day','Demand 5-day','junior_secondary','rotating',5,40,40,2026,2026,'draft','{"locator":"cycle"}'::jsonb),
  ('f60f0000-0000-4000-8000-000000000003','f60c0000-0000-4000-8000-000000000001','demand-conflict-a','Demand conflict A','junior_secondary','rotating',7,40,56,2026,2026,'draft','{"locator":"conflict-a"}'::jsonb),
  ('f60f0000-0000-4000-8000-000000000004','f60c0000-0000-4000-8000-000000000001','demand-conflict-b','Demand conflict B','junior_secondary','rotating',7,40,56,2026,2026,'draft','{"locator":"conflict-b"}'::jsonb);

update public.curriculum_time_profiles
set status='verified'
where id in(
  'f60f0000-0000-4000-8000-000000000001',
  'f60f0000-0000-4000-8000-000000000002',
  'f60f0000-0000-4000-8000-000000000003',
  'f60f0000-0000-4000-8000-000000000004'
);
update public.curriculum_time_profiles
set status='published'
where id in(
  'f60f0000-0000-4000-8000-000000000001',
  'f60f0000-0000-4000-8000-000000000002',
  'f60f0000-0000-4000-8000-000000000003',
  'f60f0000-0000-4000-8000-000000000004'
);

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,
  grade_from,grade_to,periods_per_cycle,rule_strength,source_locator,status
) values
  ('f6100000-0000-4000-8000-000000000001','f60f0000-0000-4000-8000-000000000001','f60d0000-0000-4000-8000-000000000001','demand-main-g9','subject','Demand Main',9,9,4,'prescribed','Main Grade 9','draft'),
  ('f6100000-0000-4000-8000-000000000002','f60f0000-0000-4000-8000-000000000002','f60d0000-0000-4000-8000-000000000003','demand-cycle-g9','subject','Demand Cycle',9,9,2,'prescribed','Cycle Grade 9','draft'),
  ('f6100000-0000-4000-8000-000000000003','f60f0000-0000-4000-8000-000000000003','f60d0000-0000-4000-8000-000000000004','demand-conflict-a-g9','subject','Demand Conflict A',9,9,2,'prescribed','Conflict A Grade 9','draft'),
  ('f6100000-0000-4000-8000-000000000004','f60f0000-0000-4000-8000-000000000004','f60d0000-0000-4000-8000-000000000004','demand-conflict-b-g9','subject','Demand Conflict B',9,9,3,'prescribed','Conflict B Grade 9','draft');

update public.curriculum_time_allocations
set status='verified'
where id in(
  'f6100000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000002',
  'f6100000-0000-4000-8000-000000000003',
  'f6100000-0000-4000-8000-000000000004'
);
update public.curriculum_time_allocations
set status='published'
where id in(
  'f6100000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000002'
);

update public.curriculum_time_allocations
set status='published'
where id='f6100000-0000-4000-8000-000000000003';

update public.curriculum_time_allocations
set
  status='published',
  conflict_acknowledgement_reason='Fixture intentionally preserves an acknowledged official source conflict'
where id='f6100000-0000-4000-8000-000000000004';

insert into public.curriculum_scheduling_constraints(
  id,source_id,curriculum_subject_id,allocation_id,constraint_key,constraint_type,
  grade_from,grade_to,cycle_kind,cycle_length,rule_strength,numeric_value,value,
  source_locator,effective_from_year,effective_to_year,status
) values(
  'f6110000-0000-4000-8000-000000000001',
  'f60c0000-0000-4000-8000-000000000001',
  'f60d0000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000001',
  'demand-main-double',
  'min_double_periods_per_cycle',
  9,9,'rotating',7,'prescribed',1,'{}'::jsonb,
  'Main Grade 9 double-period rule',
  2026,2026,'draft'
);
update public.curriculum_scheduling_constraints
set status='verified'
where id='f6110000-0000-4000-8000-000000000001';
update public.curriculum_scheduling_constraints
set status='published'
where id='f6110000-0000-4000-8000-000000000001';

reset role;
select set_config('request.jwt.claim.sub','f6020000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (
    select allocation_id::text
    from public.resolve_curriculum_time_allocation(
      'f60d0000-0000-4000-8000-000000000001',
      null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'f6100000-0000-4000-8000-000000000001',
  'fixture official allocation resolves for the exact school cycle'
);

select lives_ok(
  $$select *
    from public.reconcile_subject_offering_time_allocation(
      'f6070000-0000-4000-8000-000000000004',
      'school_override',
      'f6100000-0000-4000-8000-000000000001',
      3::smallint,
      null,
      'Local programme requires three periods'
    )$$,
  'explicit school override fixture is recorded through Slice 2 governance'
);

reset role;

insert into public.timetable_slots(
  id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,
  register_class_id,teacher_allocation_id,status
)
select
  gen_random_uuid(),
  'f6000000-0000-4000-8000-000000000001'::uuid,
  'f6010000-0000-4000-8000-000000000001'::uuid,
  2026,
  'R',
  1::smallint,
  ('f60b0000-0000-4000-8000-'||lpad(period_no::text,12,'0'))::uuid,
  ('f6050000-0000-4000-8000-'||lpad(class_no::text,12,'0'))::uuid,
  ('f60a0000-0000-4000-8000-'||lpad(class_no::text,12,'0'))::uuid,
  'active'
from (
  values
    (1,1),(1,2),(1,4),(1,6),
    (2,1),(2,2),(2,4),
    (3,1),(3,4),(3,6),(3,8),
    (4,1),(4,2),(4,4),
    (5,1),(5,2),(5,4),(5,6),(5,8),
    (6,1),(6,2),
    (7,1),(7,2),
    (8,1),(8,2)
) schedule(class_no,period_no);

insert into public.timetable_slots(
  id,tenant_id,school_id,academic_year,cycle_code,weekday,period_id,
  register_class_id,teacher_allocation_id,status
) values(
  'f6120000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000001',
  'f6010000-0000-4000-8000-000000000001',
  2026,'R',1,
  'f60b0000-0000-4000-8000-000000000008',
  'f6050000-0000-4000-8000-000000000001',
  'f60a0000-0000-4000-8000-000000000009',
  'active'
);

select set_config('request.jwt.claim.sub','f6020000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
  ),
  8,
  'one current demand row is returned per effective class and subject offering'
);

select is(
  (
    select string_agg(class_name||':'||demand_status,',' order by class_name)
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
  ),
  '9A:aligned,9B:under_scheduled,9C:constraint_warning,9D:school_override,9E:over_scheduled,9F:source_missing,9G:cycle_variant_missing,9H:source_conflict',
  'demand matrix exposes all required primary readiness states'
);

select is(
  (
    select concat_ws(
      ':',
      official_periods_per_cycle::text,
      school_target_periods_per_cycle::text,
      scheduled_periods_per_cycle::text,
      scheduled_variance::text,
      double_periods_required::text,
      double_periods_scheduled::text
    )
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
    where class_name='9A'
  ),
  '4:4:4:0:1:1',
  'aligned row reports official, school target, scheduled count, variance and valid double-period count'
);

select is(
  (
    select scheduled_periods_per_cycle
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
    where class_name='9A'
  ),
  4,
  'future handover timetable slots do not inflate the current scheduled count'
);

select is(
  (
    select double_periods_scheduled
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
    where class_name='9C'
  ),
  0,
  'non-teaching blocks break adjacency even when teaching slots occur later in the same day'
);

select is(
  (
    select available_cycle_variants->0->>'cycleLength'
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
    where class_name='9G'
  ),
  '5',
  'cycle-variant warning exposes the available verified cycle without mathematical fallback'
);

select is(
  (
    select count(*)::integer
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
    where class_name='9H'
      and warning_message='Multiple applicable official allocations conflict; governance review is required.'
  ),
  1,
  'official source conflict is surfaced as governance review rather than a generic system error'
);

select is(
  (
    select source_title
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
    where class_name='9A'
  ),
  'Demand Matrix Official Source',
  'resolved demand rows expose source provenance'
);

select is(
  (
    select concat_ws(
      ':',
      class_target_periods_per_cycle::text,
      class_capacity_periods_per_cycle::text,
      max_double_periods_per_cycle::text
    )
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
    where class_name='9A'
  ),
  '4:42:14',
  'pre-generation readiness exposes class target capacity and maximum double-period fit'
);

select is(
  (
    select pre_generation_warnings->>0
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
    where class_name='9D'
  ),
  'School target 3 differs from the resolved official allocation of 4.',
  'school target variance is surfaced before timetable generation'
);

select is(
  (
    select pre_generation_warnings->>0
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )
    where class_name='9G'
  ),
  'No verified official allocation exists for this exact 7-day rotating cycle.',
  'cycle-variant mismatch is surfaced as a pre-generation warning'
);

reset role;
select set_config('request.jwt.claim.sub','f6020000-0000-4000-8000-000000000003',true);
set local role authenticated;

select lives_ok(
  $$select *
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )$$,
  'HOD can read the school demand matrix'
);

reset role;
select set_config('request.jwt.claim.sub','f6020000-0000-4000-8000-000000000004',true);
set local role authenticated;

select throws_ok(
  $$select *
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )$$,
  'Permission denied',
  'teacher cannot read the school-wide curriculum demand matrix'
);

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;

select throws_ok(
  $$select *
    from public.get_timetable_curriculum_demand_matrix(
      'f6010000-0000-4000-8000-000000000001',
      2026,
      '2026-06-01'
    )$$,
  'Authentication required',
  'unauthenticated runtime calls fail closed even through authenticated SQL role'
);

select * from finish();
rollback;
