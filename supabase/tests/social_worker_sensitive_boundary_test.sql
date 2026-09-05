begin;

select plan(15);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fc100000-0000-4000-8000-000000000001','sw-boundary-teacher@example.test','authenticated','authenticated',now(),now()),
('fc100000-0000-4000-8000-000000000002','sw-boundary-social@example.test','authenticated','authenticated',now(),now()),
('fc100000-0000-4000-8000-000000000003','sw-boundary-other@example.test','authenticated','authenticated',now(),now()),
('fc100000-0000-4000-8000-000000000004','sw-boundary-platform@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Other Jurisdiction School','SW-OTHER','Khomas','Windhoek');

insert into public.staff_members(id,tenant_id,user_id,first_name,last_name,status)
values('fc110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc100000-0000-4000-8000-000000000001','Boundary','Teacher','active');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc100000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001','class_teacher',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc100000-0000-4000-8000-000000000002',null,'social_worker',current_date),
('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','fc100000-0000-4000-8000-000000000003',null,'social_worker',current_date);

insert into public.platform_memberships(user_id,role_key,active_from)
values('fc100000-0000-4000-8000-000000000004','platform_admin',current_date);

update public.register_classes
set register_teacher_staff_id='fc110000-0000-4000-8000-000000000001'
where id='40000000-0000-4000-8000-00000000001a';

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000004',true);

-- Evaluate private helper semantics as the database owner; client execution remains revoked below.
select is(
  app_private.has_explicit_support_role('22222222-2222-4222-8222-222222222222'),
  false,
  'platform admin is no longer an explicit support role at any school'
);
select is(
  app_private.user_has_explicit_support_role('fc100000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222'),
  false,
  'platform admin fails the arbitrary-actor support-role mirror'
);
select is(
  app_private.can_manage_learner_support('22222222-2222-4222-8222-222222222222'),
  false,
  'platform admin cannot manage learner support at a school it only operates'
);

select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000002',true);
set local role authenticated;

select lives_ok(
  $$insert into public.learner_support_cases(
      id,tenant_id,school_id,learner_id,enrolment_id,case_type,sensitivity,summary,status,opened_by_user_id
    ) values(
      'fc130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','safeguarding','highly_restricted','Assigned confidential case','open','fc100000-0000-4000-8000-000000000002'
    )$$,
  'school social worker can open an assigned highly restricted case'
);
select lives_ok(
  $$insert into public.learner_health_history(
      tenant_id,school_id,learner_id,enrolment_id,observed_on,general_health,sensitivity,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',current_date,'Protected condition note','restricted','fc100000-0000-4000-8000-000000000002'
    )$$,
  'social worker can retain authorized restricted health history'
);
select lives_ok(
  $$insert into public.learner_cumulative_notes(
      tenant_id,school_id,learner_id,enrolment_id,note_type,note,sensitivity,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001','case_note','Protected case note','highly_restricted','fc100000-0000-4000-8000-000000000002'
    )$$,
  'social worker can retain authorized confidential case notes'
);
select is((select count(*)::integer from public.learner_support_cases where id='fc130000-0000-4000-8000-000000000001'),1,'authorized custodian can read the assigned confidential case');
reset role;

select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok(
  $$insert into public.conduct_events(
      id,tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,summary,recorded_by_user_id
    ) values(
      'fc120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'negative','behavior','Class teacher referral note','fc100000-0000-4000-8000-000000000001'
    )$$,
  'class teacher can submit an observation/referral for their class'
);
select is((select count(*)::integer from public.learner_support_cases where school_id='22222222-2222-4222-8222-222222222222'),0,'contributing teacher cannot read confidential learner-support cases');
select is((select count(*)::integer from public.learner_health_history where school_id='22222222-2222-4222-8222-222222222222'),0,'contributing teacher cannot read restricted health CRC history');
select throws_ok(
  $$insert into public.learner_support_cases(
      tenant_id,school_id,learner_id,enrolment_id,case_type,sensitivity,summary,opened_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001','safeguarding','highly_restricted','Teacher cannot open this','fc100000-0000-4000-8000-000000000001'
    )$$,
  'Learner support opener mismatch: user is not authorized to create this case',
  'teacher cannot create a highly restricted support case'
);
reset role;

select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.learner_support_cases where id='fc130000-0000-4000-8000-000000000001'),0,'social worker at another school cannot access unrelated school cases');
select is((select count(*)::integer from public.learner_health_history where school_id='22222222-2222-4222-8222-222222222222'),0,'social worker at another school cannot read restricted health CRC history');
reset role;

select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is((select count(*)::integer from public.learner_support_cases where school_id='22222222-2222-4222-8222-222222222222'),0,'platform admin sees no confidential learner-support cases');
reset role;

select ok(
  not has_function_privilege('authenticated','app_private.has_explicit_support_role(uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.has_explicit_support_role(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_has_explicit_support_role(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_has_explicit_support_role(uuid,uuid)','EXECUTE'),
  'explicit support-role helpers are private from client roles'
);

select * from finish();
rollback;