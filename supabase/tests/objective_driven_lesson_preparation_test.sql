begin;

select plan(10);

select has_table('public','lesson_preparation_deliveries','reusable lesson preparation delivery relation exists');
select has_column('public','lesson_preparations','selected_competency_ids','lesson preparation stores binding competency selection');
select has_column('public','lesson_preparations','session_count','lesson preparation stores multi-session count');

select ok(
  not has_table_privilege('anon','public.lesson_preparation_deliveries','SELECT')
  and not has_table_privilege('anon','public.lesson_preparation_deliveries','INSERT'),
  'anonymous clients cannot read or assign preparation deliveries'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename='lesson_preparation_deliveries'),
  2,
  'delivery relation has bounded read and owner-assignment RLS policies'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('b8200000-0000-4000-8000-000000000001','objective-prep@example.test','authenticated','authenticated',now(),now());

set local session_replication_role=replica;

insert into public.teacher_allocations(
  id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
) values(
  'b8210000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,
  'b8220000-0000-4000-8000-000000000001',
  'b8230000-0000-4000-8000-000000000001',
  'b8240000-0000-4000-8000-000000000001',
  current_date-30
);

insert into public.pacing_plan_items(
  id,tenant_id,school_id,pacing_plan_id,curriculum_unit_id,planned_periods
) values
(
  'b8250000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'b8260000-0000-4000-8000-000000000001',
  'b8270000-0000-4000-8000-000000000001',
  2
),
(
  'b8250000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'b8260000-0000-4000-8000-000000000001',
  'b8270000-0000-4000-8000-000000000002',
  1
);

insert into public.teaching_schedule_items(
  id,tenant_id,school_id,academic_year,pacing_plan_item_id,register_class_id,
  teacher_allocation_id,planned_on,planned_period_count,status
) values
(
  'b8280000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,'b8250000-0000-4000-8000-000000000001',
  'b8230000-0000-4000-8000-000000000001',
  'b8210000-0000-4000-8000-000000000001',
  current_date,1,'planned'
),
(
  'b8280000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,'b8250000-0000-4000-8000-000000000001',
  'b8230000-0000-4000-8000-000000000001',
  'b8210000-0000-4000-8000-000000000001',
  current_date+1,1,'planned'
),
(
  'b8280000-0000-4000-8000-000000000003',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2026,'b8250000-0000-4000-8000-000000000002',
  'b8230000-0000-4000-8000-000000000001',
  'b8210000-0000-4000-8000-000000000001',
  current_date+2,1,'planned'
);

insert into public.lesson_preparations(
  id,tenant_id,school_id,teaching_schedule_item_id,planned_on,curriculum_snapshot,
  preparation,status,prepared_by_user_id,academic_year,subject_offering_id,
  curriculum_unit_id,curriculum_version_id,selected_competency_ids,session_count
) values(
  'b8290000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'b8280000-0000-4000-8000-000000000001',
  current_date,'{}','{}','draft',
  'b8200000-0000-4000-8000-000000000001',
  2026,'b8220000-0000-4000-8000-000000000001',
  'b8270000-0000-4000-8000-000000000001',
  'b82a0000-0000-4000-8000-000000000001',
  '{}'::uuid[],2
);

set local session_replication_role=origin;

select lives_ok(
  $$insert into public.lesson_preparation_deliveries(
      tenant_id,school_id,lesson_preparation_id,teaching_schedule_item_id,
      session_number,assigned_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'b8290000-0000-4000-8000-000000000001',
      'b8280000-0000-4000-8000-000000000002',
      2,'b8200000-0000-4000-8000-000000000001'
    )$$,
  'one reusable preparation can be assigned to another schedule for the same curriculum unit'
);

select throws_ok(
  $$insert into public.lesson_preparation_deliveries(
      tenant_id,school_id,lesson_preparation_id,teaching_schedule_item_id,
      session_number,assigned_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'b8290000-0000-4000-8000-000000000001',
      'b8280000-0000-4000-8000-000000000003',
      1,'b8200000-0000-4000-8000-000000000001'
    )$$,
  'Lesson preparation delivery scope or curriculum does not match the reusable preparation',
  'reuse across a different curriculum unit fails closed'
);

select throws_ok(
  $$insert into public.lesson_preparation_deliveries(
      tenant_id,school_id,lesson_preparation_id,teaching_schedule_item_id,
      session_number,assigned_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'b8290000-0000-4000-8000-000000000001',
      'b8280000-0000-4000-8000-000000000001',
      3,'b8200000-0000-4000-8000-000000000001'
    )$$,
  'Lesson preparation delivery session exceeds the preparation session count',
  'delivery cannot target a session beyond the preparation session count'
);

select ok(
  pg_get_functiondef('app_private.enforce_objective_lesson_preparation_integrity()'::regprocedure)
    ilike '%Selected lesson competency does not belong to the preparation curriculum unit%',
  'competency binding guard fails closed outside the preparation curriculum unit'
);

select ok(
  pg_get_functiondef('app_private.enforce_objective_lesson_preparation_integrity()'::regprocedure)
    ilike '%Lesson preparation curriculum identity and provenance are immutable%',
  'preparation curriculum identity is guarded as immutable provenance'
);

select * from finish();
rollback;
