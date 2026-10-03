begin;

select plan(14);

select has_function(
  'public',
  'get_assessment_quality_readiness',
  array['uuid','integer','smallint'],
  'assessment quality/readiness RPC exists'
);

select is(
  has_function_privilege(
    'anon',
    'public.get_assessment_quality_readiness(uuid,integer,smallint)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot read assessment quality/readiness'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.get_assessment_quality_readiness(uuid,integer,smallint)',
    'EXECUTE'
  ),
  true,
  'authenticated school users can invoke the governed read model'
);

select ok(
  pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%learner_marks_current%',
  'component analytics use the canonical current mark revision view'
);

select ok(
  pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%learner_subject_registered_on%',
  'completion denominator reuses canonical dated subject-registration eligibility'
);

select ok(
  pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%mark_enrolment.id=mark.enrolment_id%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%mark_enrolment.register_class_id=s.register_class_id%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%learner_subject_registered_on(%mark_enrolment.id%',
  'component numerator and statistics use the same dated enrolment and subject-registration eligibility as the denominator'
);

select ok(
  pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%capture_mode=''final_result''%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%final_result_only%',
  'final-result-only schemes explicitly suppress component statistics'
);

select ok(
  pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%exam_paper%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%exam_total%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%else ''ca''%',
  'CA versus examination category derives from governed component types'
);

select ok(
  pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%percentile_cont(0.5)%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%average_percent%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%high_percent%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%low_percent%',
  'component review indicators expose average median high and low'
);

select ok(
  pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%missing_required_records%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%captured_records%',
  'required-mark completion and missing readiness are derived'
);

select ok(
  pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%when s.status in (''not_open'',''open'') then ''draft''%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%when s.status in (''submitted'',''review'') then ''submitted''%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%when s.status=''verified'' then ''verified''%'
  and pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%when s.status=''locked'' then ''locked''%',
  'moderation/verification readiness maps existing lifecycle without a second workflow'
);

select ok(
  pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%hod_responsible_for_subject%',
  'HOD read scope is department/subject responsibility bounded'
);

select ok(
  pg_get_functiondef(
    'public.get_assessment_quality_readiness(uuid,integer,smallint)'::regprocedure
  ) ilike '%membership.staff_member_id=ta.staff_member_id%',
  'teacher read scope derives from canonical teacher allocation ownership'
);

select throws_ok(
  $$select *
    from public.get_assessment_quality_readiness(
      null,
      2026,
      null
    )$$,
  'Authentication required',
  'unauthenticated calls fail closed before scope resolution'
);

select * from finish();
rollback;
