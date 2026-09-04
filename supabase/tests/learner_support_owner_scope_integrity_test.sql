begin;

select plan(7);

select has_function(
  'app_private','enforce_learner_support_owner_scope_integrity',array[]::text[],
  'learner support owner scope helper exists'
);

select trigger_is(
  'public','learner_support_cases','learner_support_owner_scope_integrity_trg',
  'app_private','enforce_learner_support_owner_scope_integrity',
  'learner support owner integrity trigger installed'
);

select is(
  has_function_privilege('anon','app_private.enforce_learner_support_owner_scope_integrity()','EXECUTE'),
  false,
  'anon cannot execute learner support owner helper'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fc500000-0000-4000-8000-000000000001','support-owner-primary@example.test','authenticated','authenticated',now(),now()),
  ('fc500000-0000-4000-8000-000000000002','support-owner-other-school@example.test','authenticated','authenticated',now(),now()),
  ('fc500000-0000-4000-8000-000000000003','support-case-creator@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values(
  'fc510000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Support Scope Secondary School','SUPPORT002','Erongo','Walvis Bay'
);

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fc520000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc500000-0000-4000-8000-000000000001','SUPPORT-OWN-1','Primary','Owner','active'),
  ('fc520000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc500000-0000-4000-8000-000000000002','SUPPORT-OWN-2','Other','Owner','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values
  ('fc530000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc520000-0000-4000-8000-000000000001','support',current_date-10,'fc500000-0000-4000-8000-000000000003'),
  ('fc530000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc510000-0000-4000-8000-000000000001','fc520000-0000-4000-8000-000000000002','support',current_date-10,'fc500000-0000-4000-8000-000000000003');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fc500000-0000-4000-8000-000000000003',
  null,
  'learner_support',
  current_date
);

select lives_ok(
  $$insert into public.learner_support_cases(
      id,tenant_id,school_id,learner_id,enrolment_id,opened_on,case_type,sensitivity,summary,status,owner_staff_member_id,opened_by_user_id
    ) values(
      'fc540000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'wellbeing','highly_restricted',
      'Owner scope integrity case','open','fc520000-0000-4000-8000-000000000001','fc500000-0000-4000-8000-000000000003'
    )$$,
  'active staff placed at the case school can own a learner support case'
);

select throws_ok(
  $$update public.learner_support_cases
       set owner_staff_member_id='fc520000-0000-4000-8000-000000000002'
     where id='fc540000-0000-4000-8000-000000000001'$$,
  'Learner support owner must have an active placement at the case school',
  'staff from another school in the same tenant cannot be assigned as case owner'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc500000-0000-4000-8000-000000000001',true);

select is(
  app_private.can_access_learner_support_case('fc540000-0000-4000-8000-000000000001'),
  true,
  'valid current case owner can access the highly restricted case'
);

update public.staff_school_assignments
set effective_to=current_date-1
where id='fc530000-0000-4000-8000-000000000001';

select is(
  app_private.can_access_learner_support_case('fc540000-0000-4000-8000-000000000001'),
  false,
  'former owner who no longer has a current school placement cannot retain owner-based access'
);

select * from finish();
rollback;
