begin;
select plan(20);

select has_function('public','get_sports_house_operational_learner_roster',array['uuid','integer'],'operational sports learner roster exists');
select has_function('public','resolve_effective_learner_guardian_contact',array['uuid','uuid','date'],'shared guardian contact resolver exists');
select has_function('public','get_learner_compact_operational_context',array['uuid','uuid','integer','uuid'],'compact learner context resolver exists');

select is(
  has_function_privilege('anon','public.resolve_effective_learner_guardian_contact(uuid,uuid,date)','EXECUTE'),
  false,
  'anonymous clients cannot resolve immediate guardian contact'
);

select is(
  has_function_privilege('authenticated','public.resolve_effective_learner_guardian_contact(uuid,uuid,date)','EXECUTE'),
  true,
  'authenticated scoped users can invoke guardian resolver'
);

select ok(
  exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='sports_age_group_source_proposals'
      and cmd='SELECT'
  ),
  'source age-group proposals are school-readable through RLS'
);

select is(
  has_table_privilege('authenticated','public.sports_age_group_source_proposals','INSERT'),
  false,
  'source proposal table has no direct authenticated mutation'
);

select ok(
  not exists(
    select 1 from public.sports_age_group_source_proposals p
    join public.sports_age_groups g
      on g.school_id=p.school_id
     and g.label=any(p.labels)
    where p.source_key='nhs-sports-teams-2026'
      and p.provenance->>'canonical_write'='false'
      and g.created_at=p.created_at
  ),
  'source label proposal never silently creates canonical age bands'
);

select ok(
  pg_get_functiondef(
    'public.resolve_effective_learner_guardian_contact(uuid,uuid,date)'::regprocedure
  ) not ilike '%guardian_addresses%',
  'compact guardian resolver never reads or returns guardian addresses'
);

select ok(
  pg_get_functiondef(
    'public.resolve_effective_learner_guardian_contact(uuid,uuid,date)'::regprocedure
  ) ilike '%contact_type in (''mobile'',''phone'')%',
  'guardian resolver requires a usable phone contact'
);

select ok(
  pg_get_functiondef(
    'public.get_sports_house_operational_learner_roster(uuid,integer)'::regprocedure
  ) ilike '%register_class_id%',
  'operational sports roster includes register-class scope'
);

select ok(
  pg_get_functiondef(
    'public.get_learner_compact_operational_context(uuid,uuid,integer,uuid)'::regprocedure
  ) ilike '%learner_subject_registrations%',
  'compact learner subjects derive from canonical learner subject registrations'
);

select ok(
  pg_get_functiondef(
    'public.resolve_effective_learner_guardian_contact(uuid,uuid,date)'::regprocedure
  ) ilike '%has_platform_role(array[''platform_support''])%Permission denied%',
  'Platform Support is explicitly denied immediate guardian-contact PII'
);

select ok(
  pg_get_functiondef(
    'public.get_learner_compact_operational_context(uuid,uuid,integer,uuid)'::regprocedure
  ) ilike '%has_platform_role(array[''platform_support''])%Permission denied%',
  'Platform Support is explicitly denied learner compact operational context'
);

select ok(
  pg_get_functiondef(
    'public.get_sports_house_operational_learner_roster(uuid,integer)'::regprocedure
  ) ilike '%can_read_learner_identity(p_school_id,e.learner_id)%',
  'operational roster applies canonical per-learner identity scope'
);

select ok(
  pg_get_functiondef(
    'public.resolve_effective_learner_guardian_contact(uuid,uuid,date)'::regprocedure
  ) ilike '%can_read_guardian(lg.guardian_id)%',
  'guardian resolver applies canonical guardian-read authorization'
);

select ok(
  pg_get_functiondef(
    'public.resolve_effective_learner_guardian_contact(uuid,uuid,date)'::regprocedure
  ) ilike '%is_guardian_current_school(p_school_id)%',
  'guardian resolver preserves current-school boundary'
);

select ok(
  pg_get_functiondef(
    'public.get_learner_compact_operational_context(uuid,uuid,integer,uuid)'::regprocedure
  ) ilike '%can_read_learner_identity(p_school_id,p_learner_id)%',
  'compact learner context applies canonical learner identity scope'
);

select ok(
  pg_get_functiondef(
    'public.resolve_effective_learner_guardian_contact(uuid,uuid,date)'::regprocedure
  ) ilike '%can_read_learner_identity(p_school_id,p_learner_id)%',
  'guardian resolver requires canonical learner identity access as well as guardian access'
);

select ok(
  pg_get_functiondef(
    'public.get_learner_compact_operational_context(uuid,uuid,integer,uuid)'::regprocedure
  ) ilike '%can_read_learner_subject_registration(%p_school_id%p_enrolment_id%lsr.subject_offering_id%',
  'compact learner subject combination applies canonical per-registration read scope'
);

select * from finish();
rollback;
