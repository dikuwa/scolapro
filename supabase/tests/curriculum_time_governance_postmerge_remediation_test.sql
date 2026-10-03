begin;

select plan(17);

select has_function(
  'app_private',
  'curriculum_time_profile_supersedes',
  array['uuid','uuid'],
  'profile supersession helper exists'
);

select ok(
  exists(
    select 1 from pg_trigger
    where tgrelid='public.curriculum_time_profiles'::regclass
      and tgname='zz_curriculum_time_profile_nonempty_publication_ctr'
      and not tgisinternal
  ),
  'database-wide nonempty publication constraint trigger exists'
);

select ok(
  exists(
    select 1 from pg_trigger
    where tgrelid='public.curriculum_time_profiles'::regclass
      and tgname='zz_curriculum_time_profile_nonempty_publication_ctr'
      and tgdeferrable and tginitdeferred
  ),
  'nonempty publication invariant is deferred for profile-first transactions'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fc120000-0000-4000-8000-000000000001','governance-remediation@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('fc120000-0000-4000-8000-000000000001','platform_admin',current_date-10);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc120000-0000-4000-8000-000000000001',true);
set local role authenticated;

insert into public.curriculum_sources(
  id,authority,source_key,title,source_url,checksum,provenance,status
) values(
  'fc130000-0000-4000-8000-000000000001','NIED','gov-remediation',
  'Governance Remediation Source','https://example.test/governance-remediation.pdf',
  'sha256:governance-remediation','{"reviewed":true}'::jsonb,'discovered'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'source','fc130000-0000-4000-8000-000000000001','verify',null,null
  )$$,
  'complete source can be human-verified'
);

insert into public.curriculum_subjects(
  id,curriculum_key,display_name,phase_code,subject_code,authority,active
) values(
  'fc140000-0000-4000-8000-000000000001',
  'governance-remediation-math','Governance Remediation Mathematics',
  'junior_secondary','GRM','NIED',true
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  total_periods_per_cycle,effective_from_year,effective_to_year,status,provenance
) values(
  'fc150000-0000-4000-8000-000000000001',
  'fc130000-0000-4000-8000-000000000001',
  'gov-remediation-base','Governance Remediation Base',
  'junior_secondary','rotating',7,40,56,2026,2026,'draft',
  '{"locator":"base profile"}'::jsonb
);

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,
  grade_from,grade_to,periods_per_cycle,rule_strength,source_locator,status
) values(
  'fc160000-0000-4000-8000-000000000001',
  'fc150000-0000-4000-8000-000000000001',
  'fc140000-0000-4000-8000-000000000001',
  'gov-remediation-math-g9','subject','Governance Remediation Mathematics',
  9,9,5,'prescribed','Base source Grade 9','draft'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'allocation','fc160000-0000-4000-8000-000000000001','verify',null,null
  )$$,
  'base allocation verifies'
);
select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'profile','fc150000-0000-4000-8000-000000000001','verify',null,null
  )$$,
  'base profile verifies'
);
select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'profile','fc150000-0000-4000-8000-000000000001','publish',null,null
  )$$,
  'base profile publishes'
);
select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'allocation','fc160000-0000-4000-8000-000000000001','publish',null,null
  )$$,
  'base allocation publishes'
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  total_periods_per_cycle,effective_from_year,effective_to_year,status,
  supersedes_profile_id,provenance
) values(
  'fc150000-0000-4000-8000-000000000002',
  'fc130000-0000-4000-8000-000000000001',
  'gov-remediation-successor','Governance Remediation Successor',
  'junior_secondary','rotating',7,40,56,2026,2026,'draft',
  'fc150000-0000-4000-8000-000000000001',
  '{"locator":"successor profile"}'::jsonb
);

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,
  grade_from,grade_to,periods_per_cycle,rule_strength,source_locator,status
) values(
  'fc160000-0000-4000-8000-000000000002',
  'fc150000-0000-4000-8000-000000000002',
  'fc140000-0000-4000-8000-000000000001',
  'gov-remediation-math-g9-successor','subject','Governance Remediation Mathematics',
  9,9,6,'prescribed','Successor source Grade 9','draft'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'allocation','fc160000-0000-4000-8000-000000000002','verify',null,null
  )$$,
  'successor allocation verifies without allocation-level supersession'
);
select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'profile','fc150000-0000-4000-8000-000000000002','verify',null,null
  )$$,
  'successor profile verifies'
);
select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'profile','fc150000-0000-4000-8000-000000000002','publish',null,null
  )$$,
  'profile-level supersession allows governed successor profile publication'
);
select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'allocation','fc160000-0000-4000-8000-000000000002','publish',null,null
  )$$,
  'profile-level supersession also allows successor allocation publication'
);

select is(
  (
    select count(*)::integer
    from public.get_curriculum_time_governance_conflicts() c
    where c.allocation_a_id in (
      'fc160000-0000-4000-8000-000000000001',
      'fc160000-0000-4000-8000-000000000002'
    )
    and c.allocation_b_id in (
      'fc160000-0000-4000-8000-000000000001',
      'fc160000-0000-4000-8000-000000000002'
    )
  ),
  0,
  'profile-superseded allocation pairs are not reported as source conflicts'
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,
  effective_from_year,status,supersedes_profile_id,provenance
) values(
  'fc150000-0000-4000-8000-000000000003',
  'fc130000-0000-4000-8000-000000000001',
  'gov-remediation-grandchild','Governance Remediation Grandchild',
  'junior_secondary','rotating',7,2027,'draft',
  'fc150000-0000-4000-8000-000000000002',
  '{"locator":"grandchild profile"}'::jsonb
);

reset role;

select ok(
  app_private.curriculum_time_profile_supersedes(
    'fc150000-0000-4000-8000-000000000002',
    'fc150000-0000-4000-8000-000000000001'
  ),
  'direct profile supersession is recognized'
);

select ok(
  app_private.curriculum_time_profile_supersedes(
    'fc150000-0000-4000-8000-000000000003',
    'fc150000-0000-4000-8000-000000000001'
  ),
  'transitive profile supersession chain is recognized'
);

set local role authenticated;

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,
  effective_from_year,status,provenance
) values(
  'fc150000-0000-4000-8000-000000000004',
  'fc130000-0000-4000-8000-000000000001',
  'gov-remediation-empty','Governance Remediation Empty',
  'junior_secondary','rotating',7,2028,'draft',
  '{"locator":"empty profile"}'::jsonb
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'profile','fc150000-0000-4000-8000-000000000004','verify',null,null
  )$$,
  'empty profile may be staged and verified before rules are attached'
);

set constraints zz_curriculum_time_profile_nonempty_publication_ctr immediate;

select throws_ok(
  $$update public.curriculum_time_profiles
    set status='published'
    where id='fc150000-0000-4000-8000-000000000004'$$,
  'Curriculum time profile publication requires at least one reviewed allocation',
  'direct table publication cannot bypass the nonempty-profile invariant'
);

set constraints zz_curriculum_time_profile_nonempty_publication_ctr deferred;

select * from finish();
rollback;
