begin;

select plan(17);

select has_function(
  'app_private','enforce_learner_event_enrolment_period',array[]::text[],
  'learner history event-period helper exists'
);

select has_function(
  'app_private','enforce_support_intervention_case_period',array[]::text[],
  'support intervention case-period helper exists'
);

select trigger_is(
  'public','conduct_events','conduct_events_learner_temporal_scope_guard',
  'app_private','enforce_learner_event_enrolment_period',
  'conduct event temporal guard is installed'
);

select trigger_is(
  'public','achievement_events','achievement_events_learner_temporal_scope_guard',
  'app_private','enforce_learner_event_enrolment_period',
  'achievement event temporal guard is installed'
);

select trigger_is(
  'public','learner_support_cases','learner_support_cases_learner_temporal_scope_guard',
  'app_private','enforce_learner_event_enrolment_period',
  'learner support case temporal guard is installed'
);

select trigger_is(
  'public','learner_support_interventions','learner_support_interventions_case_temporal_guard',
  'app_private','enforce_support_intervention_case_period',
  'support intervention temporal guard is installed'
);

select ok(
  not has_function_privilege('anon','app_private.enforce_learner_event_enrolment_period()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_learner_event_enrolment_period()','EXECUTE'),
  'learner event temporal helper is not client executable'
);

select ok(
  not has_function_privilege('anon','app_private.enforce_support_intervention_case_period()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_support_intervention_case_period()','EXECUTE'),
  'support intervention temporal helper is not client executable'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fa000000-0000-4000-8000-000000000001','history-period-author@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('fa100000-0000-4000-8000-000000000001','Learner History Period Tenant','learner-history-period-tenant');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fa200000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','Learner History Period School','HIST-PERIOD','Khomas','Windhoek');

-- This suite tests event/enrolment timing, not recorder authority. Keep its
-- historical author genuinely authorized under the current observation access
-- model so the temporal guard remains the first relevant failure.
insert into public.school_memberships(
  tenant_id,school_id,user_id,role_key,active_from,active_to
) values(
  'fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001','principal',current_date-10,null
);

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values('fa300000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','History','Learner','2011-03-01','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,enrolled_to,status)
values(
  'fa400000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  'fa200000-0000-4000-8000-000000000001',
  'fa300000-0000-4000-8000-000000000001',
  2026,'2026-01-15','2026-11-30','completed'
);

select throws_ok(
  $$insert into public.conduct_events(
      tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,severity,summary,status,recorded_by_user_id
    ) values(
      'fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',
      'fa400000-0000-4000-8000-000000000001','2026-01-14','negative','PERIOD','routine','Predates enrolment','recorded','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Learner event date must fall within referenced enrolment period',
  'conduct event cannot predate its referenced enrolment'
);

select throws_ok(
  $$insert into public.achievement_events(
      tenant_id,school_id,learner_id,enrolment_id,achieved_on,category_code,title,recorded_by_user_id
    ) values(
      'fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',
      'fa400000-0000-4000-8000-000000000001','2026-12-01','PERIOD','After enrolment','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Learner event date must fall within referenced enrolment period',
  'achievement event cannot postdate its referenced enrolment'
);

select throws_ok(
  $$insert into public.learner_support_cases(
      tenant_id,school_id,learner_id,enrolment_id,opened_on,case_type,sensitivity,summary,status,opened_by_user_id
    ) values(
      'fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',
      'fa400000-0000-4000-8000-000000000001','2025-12-15','wellbeing','restricted','Predates enrolment','open','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Learner event date must fall within referenced enrolment period',
  'support case cannot open before its referenced enrolment'
);

select throws_ok(
  $$insert into public.conduct_events(
      tenant_id,school_id,learner_id,occurred_on,direction,category_code,severity,summary,status,recorded_by_user_id
    ) values(
      'fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',
      '2027-02-01','negative','PERIOD','routine','No covering enrolment','recorded','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Learner event date must fall within a school enrolment period',
  'omitting enrolment id cannot turn an old school relationship into authority for a later event'
);

select lives_ok(
  $$insert into public.conduct_events(
      id,tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,severity,summary,status,recorded_by_user_id
    ) values(
      'fa500000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',
      'fa400000-0000-4000-8000-000000000001','2026-03-10','negative','PERIOD','routine','Valid event','recorded','fa000000-0000-4000-8000-000000000001'
    );
    insert into public.achievement_events(
      tenant_id,school_id,learner_id,achieved_on,category_code,title,recorded_by_user_id
    ) values(
      'fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',
      '2026-04-20','PERIOD','Valid achievement','fa000000-0000-4000-8000-000000000001'
    );
    insert into public.learner_support_cases(
      id,tenant_id,school_id,learner_id,enrolment_id,opened_on,case_type,sensitivity,summary,status,opened_by_user_id,closed_on
    ) values(
      'fa600000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',
      'fa400000-0000-4000-8000-000000000001','2026-02-01','wellbeing','restricted','Valid support case','closed','fa000000-0000-4000-8000-000000000001','2026-06-30'
    )$$,
  'history records remain valid when their dates fall inside the learner enrolment period'
);

select throws_ok(
  $$insert into public.learner_support_interventions(
      tenant_id,school_id,support_case_id,intervention_date,intervention_type,note,recorded_by_user_id
    ) values(
      'fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001',
      '2026-01-31','meeting','Before case opened','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Support intervention date cannot precede case opening date',
  'support intervention cannot predate its parent case'
);

select throws_ok(
  $$insert into public.learner_support_interventions(
      tenant_id,school_id,support_case_id,intervention_date,intervention_type,note,recorded_by_user_id
    ) values(
      'fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001',
      '2026-07-01','meeting','After case closed','fa000000-0000-4000-8000-000000000001'
    )$$,
  'Support intervention date cannot fall after case closing date',
  'support intervention cannot postdate a closed parent case'
);

select lives_ok(
  $$insert into public.learner_support_interventions(
      tenant_id,school_id,support_case_id,intervention_date,intervention_type,note,recorded_by_user_id
    ) values(
      'fa100000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001',
      '2026-05-15','meeting','Within case lifetime','fa000000-0000-4000-8000-000000000001'
    )$$,
  'support intervention remains valid inside the parent case lifetime'
);

select throws_ok(
  $$update public.conduct_events
       set occurred_on='2026-12-15'
     where id='fa500000-0000-4000-8000-000000000001'$$,
  'Learner event date must fall within referenced enrolment period',
  'later correction cannot move a conduct event outside its referenced enrolment period'
);

select * from finish();
rollback;
