begin;

select plan(15);

select has_function(
  'public',
  'get_curriculum_time_governance_conflicts',
  array[]::text[],
  'governance conflict read model exists'
);
select has_function(
  'public',
  'govern_curriculum_time_registry',
  array['text','uuid','text','uuid','text'],
  'governance mutation RPC exists'
);
select is(
  has_function_privilege('anon','public.get_curriculum_time_governance_conflicts()','EXECUTE'),
  false,
  'anonymous callers cannot read national governance conflicts'
);
select is(
  has_function_privilege(
    'anon',
    'public.govern_curriculum_time_registry(text,uuid,text,uuid,text)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot mutate national governance state'
);
select ok(
  exists(
    select 1 from pg_trigger
    where tgrelid='public.curriculum_time_profiles'::regclass
      and tgname='zz_curriculum_time_profile_publication_readiness_trg'
      and not tgisinternal
  ),
  'profile publication readiness trigger is installed'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fb120000-0000-4000-8000-000000000001','governance-platform@example.test','authenticated','authenticated',now(),now()),
  ('fb120000-0000-4000-8000-000000000002','governance-school@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('fb120000-0000-4000-8000-000000000001','platform_admin',current_date-10);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fb120000-0000-4000-8000-000000000001',true);
set local role authenticated;

insert into public.curriculum_sources(
  id,authority,source_key,title,source_url,checksum,provenance,status
) values
  ('fb130000-0000-4000-8000-000000000001','NIED','gov-ready','Governance Ready Source','https://example.test/gov-ready.pdf','sha256:gov-ready','{"reviewed":true}'::jsonb,'discovered'),
  ('fb130000-0000-4000-8000-000000000002','NIED','gov-incomplete','Governance Incomplete Source',null,null,'{}'::jsonb,'discovered');

select throws_ok(
  $$select public.govern_curriculum_time_registry(
      'source',
      'fb130000-0000-4000-8000-000000000002',
      'verify',
      null,
      null
    )$$,
  'Source verification requires URL, checksum and provenance',
  'source verification fails closed without evidence'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
      'source',
      'fb130000-0000-4000-8000-000000000001',
      'verify',
      null,
      null
    )$$,
  'platform admin can human-verify a complete official source'
);

insert into public.curriculum_subjects(
  id,curriculum_key,display_name,phase_code,subject_code,authority,active
) values(
  'fb140000-0000-4000-8000-000000000001',
  'governance-math',
  'Governance Mathematics',
  'junior_secondary',
  'GOVM',
  'NIED',
  true
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  total_periods_per_cycle,effective_from_year,effective_to_year,status,provenance
) values(
  'fb150000-0000-4000-8000-000000000001',
  'fb130000-0000-4000-8000-000000000001',
  'gov-7-day',
  'Governance 7-day',
  'junior_secondary',
  'rotating',
  7,
  40,
  56,
  2026,
  2026,
  'draft',
  '{"locator":"Governance fixture"}'::jsonb
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
      'profile',
      'fb150000-0000-4000-8000-000000000001',
      'verify',
      null,
      null
    )$$,
  'platform admin can verify a draft profile'
);

select throws_ok(
  $$select public.govern_curriculum_time_registry(
      'profile',
      'fb150000-0000-4000-8000-000000000001',
      'publish',
      null,
      null
    )$$,
  'Curriculum time profile publication requires at least one reviewed allocation',
  'empty profile cannot publish'
);

update public.curriculum_time_profiles
set status='draft'
where id='fb150000-0000-4000-8000-000000000001';

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,
  grade_from,grade_to,periods_per_cycle,rule_strength,source_locator,status
) values(
  'fb160000-0000-4000-8000-000000000001',
  'fb150000-0000-4000-8000-000000000001',
  'fb140000-0000-4000-8000-000000000001',
  'gov-math-g9',
  'subject',
  'Governance Mathematics',
  9,9,5,'prescribed','Governance source Grade 9','draft'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
      'allocation',
      'fb160000-0000-4000-8000-000000000001',
      'verify',
      null,
      null
    )$$,
  'platform admin can verify reviewed allocation evidence'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
      'profile',
      'fb150000-0000-4000-8000-000000000001',
      'verify',
      null,
      null
    )$$,
  'profile can be reverified after contained allocation review'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
      'profile',
      'fb150000-0000-4000-8000-000000000001',
      'publish',
      null,
      null
    )$$,
  'profile publishes after source/profile/allocation review is complete'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
      'allocation',
      'fb160000-0000-4000-8000-000000000001',
      'publish',
      null,
      null
    )$$,
  'verified allocation can publish under the published reviewed profile'
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  total_periods_per_cycle,effective_from_year,effective_to_year,status,provenance
) values(
  'fb150000-0000-4000-8000-000000000002',
  'fb130000-0000-4000-8000-000000000001',
  'gov-7-day-conflict',
  'Governance 7-day conflict',
  'junior_secondary',
  'rotating',
  7,
  40,
  56,
  2026,
  2026,
  'draft',
  '{"locator":"Governance conflict fixture"}'::jsonb
);

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,
  grade_from,grade_to,periods_per_cycle,rule_strength,source_locator,status,
  conflict_acknowledgement_reason
) values(
  'fb160000-0000-4000-8000-000000000002',
  'fb150000-0000-4000-8000-000000000002',
  'fb140000-0000-4000-8000-000000000001',
  'gov-math-g9-conflict',
  'subject',
  'Governance Mathematics conflict',
  9,9,6,'prescribed','Governance conflict source Grade 9','draft',
  'Fixture intentionally stages a conflicting source for governance review'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
      'allocation',
      'fb160000-0000-4000-8000-000000000002',
      'link_supersession',
      'fb160000-0000-4000-8000-000000000001',
      null
    )$$,
  'draft successor can explicitly link the published predecessor'
);

select is(
  (
    select supersedes_allocation_id::text
    from public.curriculum_time_allocations
    where id='fb160000-0000-4000-8000-000000000002'
  ),
  'fb160000-0000-4000-8000-000000000001',
  'supersession linkage is persisted explicitly before verification'
);

reset role;
select set_config('request.jwt.claim.sub','fb120000-0000-4000-8000-000000000002',true);
set local role authenticated;

select throws_ok(
  $$select public.govern_curriculum_time_registry(
      'source',
      'fb130000-0000-4000-8000-000000000001',
      'verify',
      null,
      null
    )$$,
  'Platform administrator authority is required',
  'ordinary authenticated school user cannot mutate national governance data'
);

select throws_ok(
  $$select * from public.get_curriculum_time_governance_conflicts()$$,
  'Platform administrator authority is required',
  'ordinary authenticated school user cannot inspect unpublished governance conflict data'
);

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;

select throws_ok(
  $$select public.govern_curriculum_time_registry(
      'source',
      'fb130000-0000-4000-8000-000000000001',
      'verify',
      null,
      null
    )$$,
  'Authentication required',
  'governance mutation fails closed without an authenticated user'
);

select * from finish();
rollback;
