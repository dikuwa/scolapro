begin;

select plan(14);

select has_function(
  'app_private','user_can_create_learner_support_case',array['uuid','uuid','text'],
  'private arbitrary-actor support-case creation helper exists'
);
select has_function(
  'app_private','user_can_access_learner_support_case',array['uuid','uuid'],
  'private arbitrary-actor support-case access helper exists'
);
select trigger_is(
  'public','learner_support_cases','learner_support_case_actor_integrity_trg',
  'app_private','enforce_learner_support_actor_integrity',
  'support case actor guard is installed'
);
select trigger_is(
  'public','learner_support_interventions','learner_support_intervention_actor_integrity_trg',
  'app_private','enforce_learner_support_actor_integrity',
  'support intervention actor guard is installed'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fc000000-0000-4000-8000-000000000001','actor-counsellor@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000002','actor-principal@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000003','actor-unrelated@example.test','authenticated','authenticated',now(),now()),
  ('fc000000-0000-4000-8000-000000000004','actor-owner@example.test','authenticated','authenticated',now(),now());

insert into public.staff_members(id,tenant_id,user_id,employee_number,first_name,last_name,status)
values
  ('fc100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000001','SUP-ACTOR-01','Actor','Counsellor','active'),
  ('fc100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fc000000-0000-4000-8000-000000000004','SUP-ACTOR-02','Case','Owner','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,effective_from,created_by_user_id)
values
  ('fc110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc100000-0000-4000-8000-000000000001',current_date,'fc000000-0000-4000-8000-000000000001'),
  ('fc110000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc100000-0000-4000-8000-000000000002',current_date,'fc000000-0000-4000-8000-000000000001');

insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','counsellor',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000002',null,'principal',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000003',null,'teacher',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc000000-0000-4000-8000-000000000004','fc100000-0000-4000-8000-000000000002','teacher',current_date);

select throws_ok(
  $$insert into public.learner_support_cases(
      tenant_id,school_id,learner_id,enrolment_id,opened_on,case_type,sensitivity,summary,status,opened_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      current_date,'wellbeing','restricted','Forged restricted case','open','fc000000-0000-4000-8000-000000000003'
    )$$,
  'Learner support opener mismatch: user is not authorized to create this case',
  'unrelated teacher cannot be forged as restricted case opener'
);

select lives_ok(
  $$insert into public.learner_support_cases(
      id,tenant_id,school_id,learner_id,enrolment_id,opened_on,case_type,sensitivity,summary,status,owner_staff_member_id,opened_by_user_id
    ) values(
      'fc200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      current_date,'wellbeing','restricted','Principal restricted case','open','fc100000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000002'
    )$$,
  'principal remains authorized to create restricted support cases'
);

select throws_ok(
  $$insert into public.learner_support_cases(
      tenant_id,school_id,learner_id,enrolment_id,opened_on,case_type,sensitivity,summary,status,opened_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      current_date,'counselling','highly_restricted','Principal highly restricted case','open','fc000000-0000-4000-8000-000000000002'
    )$$,
  'Learner support opener mismatch: user is not authorized to create this case',
  'principal cannot be forged as highly restricted case opener'
);

select lives_ok(
  $$insert into public.learner_support_cases(
      id,tenant_id,school_id,learner_id,enrolment_id,opened_on,case_type,sensitivity,summary,status,owner_staff_member_id,opened_by_user_id
    ) values(
      'fc200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
      current_date,'counselling','highly_restricted','Counsellor highly restricted case','open','fc100000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001'
    )$$,
  'counsellor remains authorized to create highly restricted support cases'
);

select throws_ok(
  $$insert into public.learner_support_interventions(
      tenant_id,school_id,support_case_id,intervention_date,intervention_type,note,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000002',
      current_date,'meeting','Forged unrelated intervention','fc000000-0000-4000-8000-000000000003'
    )$$,
  'Learner support intervention recorder mismatch: user cannot access support case',
  'unrelated teacher cannot be forged as highly restricted intervention recorder'
);

select lives_ok(
  $$insert into public.learner_support_interventions(
      tenant_id,school_id,support_case_id,intervention_date,intervention_type,note,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000002',
      current_date,'meeting','Counsellor intervention','fc000000-0000-4000-8000-000000000001'
    )$$,
  'counsellor can record intervention on highly restricted case'
);

select lives_ok(
  $$insert into public.learner_support_interventions(
      tenant_id,school_id,support_case_id,intervention_date,intervention_type,note,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc200000-0000-4000-8000-000000000001',
      current_date,'follow_up','Owner intervention','fc000000-0000-4000-8000-000000000004'
    )$$,
  'current placed case owner can record intervention on owned restricted case'
);

select ok(
  not has_function_privilege('anon','app_private.user_can_create_learner_support_case(uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_create_learner_support_case(uuid,uuid,text)','EXECUTE'),
  'arbitrary-actor support creation helper is private'
);
select ok(
  not has_function_privilege('anon','app_private.user_can_access_learner_support_case(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.user_can_access_learner_support_case(uuid,uuid)','EXECUTE'),
  'arbitrary-actor support access helper is private'
);
select ok(
  not has_function_privilege('anon','app_private.enforce_learner_support_actor_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_learner_support_actor_integrity()','EXECUTE'),
  'support actor trigger helper is private'
);
select is((select count(*)::int from public.learner_support_cases where id in ('fc200000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000002')),2,'only authorized support cases were persisted');

select * from finish();
rollback;
