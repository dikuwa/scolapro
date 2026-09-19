begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fc000000-0000-4000-8000-000000000001','absence-live-principal@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000002','absence-live-deputy@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000003','absence-live-class@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000004','absence-live-support@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000005','absence-live-other-school@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town,status)
values(
  'fc900000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Absence QA Other School',
  'ABS-QA-OTHER',
  'Erongo',
  'Walvis Bay',
  'active'
);

set local session_replication_role = replica;

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status) values
  ('fc100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000003','ABS-LIVE-CT','Class','Teacher','active'),
  ('fc100000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000004','ABS-LIVE-PS','Platform','Support','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('fc110000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc100000-0000-4000-8000-000000000003','teacher',current_date-30,null,'fc000000-0000-4000-8000-000000000001'),
  ('fc110000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc100000-0000-4000-8000-000000000004','teacher',current_date-30,null,'fc000000-0000-4000-8000-000000000001');

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,staff_member_id,role_key,active_from
) values
  ('fc120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001',null,'principal',current_date-30),
  ('fc120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000002',null,'deputy_principal',current_date-30),
  ('fc120000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000003','class_teacher',current_date-30),
  ('fc120000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000004','fc100000-0000-4000-8000-000000000004','class_teacher',current_date-30),
  ('fc120000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','fc900000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000005',null,'school_admin',current_date-30);

insert into public.platform_memberships(user_id,role_key,active_from)
values('fc000000-0000-4000-8000-000000000004','platform_support',current_date-30);

insert into public.guardian_absence_notices(
  id,tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,
  absence_from,absence_to,reason_category,status
) values(
  'fc130000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  'fc131000-0000-4000-8000-000000000001',
  'fc132000-0000-4000-8000-000000000001',
  current_date,current_date,'illness','submitted'
);

update public.register_classes
set register_teacher_staff_id='fc100000-0000-4000-8000-000000000003'
where id='40000000-0000-4000-8000-00000000001a';

set local session_replication_role = origin;

select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select ok(
  exists(
    select 1 from public.resolve_absence_review_scope(
      '22222222-2222-4222-8222-222222222222', current_date-7, current_date
    ) where scope_kind='daily_class'
  ),
  'principal retains current-school school-wide daily absence scope'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
select ok(
  exists(
    select 1 from public.resolve_absence_review_scope(
      '22222222-2222-4222-8222-222222222222', current_date-7, current_date
    ) where scope_kind='daily_class'
  ),
  'deputy principal retains current-school school-wide daily absence scope'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000003',true);
select ok(
  exists(
    select 1 from public.resolve_absence_review_scope(
      '22222222-2222-4222-8222-222222222222', current_date-7, current_date
    ) where scope_kind='daily_class' and scope_id='40000000-0000-4000-8000-00000000001a'
  ),
  'class teacher sees only their explicitly assigned register class while placement is current'
);

update public.staff_school_assignments
set effective_to=current_date-1
where id='fc110000-0000-4000-8000-000000000003';

select is(
  (
    select count(*)::integer from public.resolve_absence_review_scope(
      '22222222-2222-4222-8222-222222222222', current_date-7, current_date
    ) where scope_kind='daily_class'
  ),
  0,
  'ended class-teacher placement removes daily/register absence scope'
);

select ok(
  not app_private.can_review_guardian_absence_notice(
    'fc130000-0000-4000-8000-000000000001'
  ),
  'ended class-teacher placement also removes guardian-notice review authority'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000004',true);
select is(
  (
    select count(*)::integer from public.resolve_absence_review_scope(
      '22222222-2222-4222-8222-222222222222', current_date-7, current_date
    )
  ),
  0,
  'Platform Support cannot borrow school-operational absence scope from a school membership'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000005',true);
select is(
  (
    select count(*)::integer from public.resolve_absence_review_scope(
      '22222222-2222-4222-8222-222222222222', current_date-7, current_date
    )
  ),
  0,
  'cross-school school administrator receives no target-school absence scope'
);

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000004',true);
select ok(
  not exists(
    select 1 from public.resolve_absence_review_scope(
      '22222222-2222-4222-8222-222222222222', current_date-7, current_date
    ) where scope_kind not in ('daily_class','subject_slot')
  ),
  'resolver introduces no broader review or correction scope kinds'
);

select ok(
  not app_private.can_review_guardian_absence_notice(
    'fc130000-0000-4000-8000-000000000001'
  ),
  'Platform Support cannot borrow guardian-notice review authority from school membership'
);

select * from finish();
rollback;
