begin;

select plan(7);

select has_function(
  'public',
  'resolve_curriculum_time_allocation',
  array['uuid','text','smallint','integer','text','smallint','uuid'],
  'canonical curriculum time resolver remains available'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values(
  'fd120000-0000-4000-8000-000000000001',
  'resolver-transitive-platform@example.test',
  'authenticated','authenticated',now(),now()
);

insert into public.platform_memberships(user_id,role_key,active_from)
values(
  'fd120000-0000-4000-8000-000000000001',
  'platform_admin',
  current_date-10
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd120000-0000-4000-8000-000000000001',true);
set local role authenticated;

insert into public.curriculum_sources(
  id,authority,source_key,title,source_url,checksum,provenance,status
) values(
  'fd130000-0000-4000-8000-000000000001',
  'NIED',
  'resolver-transitive-source',
  'Resolver Transitive Supersession Source',
  'https://example.test/resolver-transitive.pdf',
  'sha256:resolver-transitive',
  '{"fixture":"resolver-transitive"}'::jsonb,
  'discovered'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'source','fd130000-0000-4000-8000-000000000001','verify',null,null
  )$$,
  'fixture source verifies through governed lifecycle'
);

insert into public.curriculum_subjects(
  id,curriculum_key,display_name,phase_code,subject_code,authority,active
) values(
  'fd140000-0000-4000-8000-000000000001',
  'resolver-transitive-math',
  'Resolver Transitive Mathematics',
  'junior_secondary',
  'RTM',
  'NIED',
  true
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  total_periods_per_cycle,effective_from_year,effective_to_year,status,
  supersedes_profile_id,provenance
) values
  (
    'fd150000-0000-4000-8000-000000000001',
    'fd130000-0000-4000-8000-000000000001',
    'resolver-chain-a',
    'Resolver Chain A',
    'junior_secondary','rotating',7,40,56,2026,2028,'draft',
    null,
    '{"locator":"chain A"}'::jsonb
  ),
  (
    'fd150000-0000-4000-8000-000000000002',
    'fd130000-0000-4000-8000-000000000001',
    'resolver-chain-b',
    'Resolver Chain B',
    'junior_secondary','rotating',7,40,56,2027,2027,'draft',
    'fd150000-0000-4000-8000-000000000001',
    '{"locator":"chain B"}'::jsonb
  ),
  (
    'fd150000-0000-4000-8000-000000000003',
    'fd130000-0000-4000-8000-000000000001',
    'resolver-chain-c',
    'Resolver Chain C',
    'junior_secondary','rotating',7,40,56,2026,2028,'draft',
    'fd150000-0000-4000-8000-000000000002',
    '{"locator":"chain C"}'::jsonb
  );

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,
  grade_from,grade_to,periods_per_cycle,rule_strength,source_locator,status
) values
  (
    'fd160000-0000-4000-8000-000000000001',
    'fd150000-0000-4000-8000-000000000001',
    'fd140000-0000-4000-8000-000000000001',
    'resolver-chain-a-g9','subject','Resolver Chain Mathematics',
    9,9,5,'prescribed','Chain A Grade 9','draft'
  ),
  (
    'fd160000-0000-4000-8000-000000000002',
    'fd150000-0000-4000-8000-000000000002',
    'fd140000-0000-4000-8000-000000000001',
    'resolver-chain-b-g9','subject','Resolver Chain Mathematics',
    9,9,6,'prescribed','Chain B Grade 9','draft'
  ),
  (
    'fd160000-0000-4000-8000-000000000003',
    'fd150000-0000-4000-8000-000000000003',
    'fd140000-0000-4000-8000-000000000001',
    'resolver-chain-c-g9','subject','Resolver Chain Mathematics',
    9,9,7,'prescribed','Chain C Grade 9','draft'
  );

select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'allocation',id,'verify',null,null
  )
  from public.curriculum_time_allocations
  where id in(
    'fd160000-0000-4000-8000-000000000001',
    'fd160000-0000-4000-8000-000000000002',
    'fd160000-0000-4000-8000-000000000003'
  )
  order by id$$,
  'all chain allocations verify before profile publication'
);

select lives_ok(
  $$select public.govern_curriculum_time_registry(
    'profile',id,'verify',null,null
  )
  from public.curriculum_time_profiles
  where id in(
    'fd150000-0000-4000-8000-000000000001',
    'fd150000-0000-4000-8000-000000000002',
    'fd150000-0000-4000-8000-000000000003'
  )
  order by id$$,
  'all chain profiles verify'
);

select lives_ok(
  $sql$
  do $chain$
  begin
    perform public.govern_curriculum_time_registry(
      'profile','fd150000-0000-4000-8000-000000000001','publish',null,null
    );
    perform public.govern_curriculum_time_registry(
      'allocation','fd160000-0000-4000-8000-000000000001','publish',null,null
    );
    perform public.govern_curriculum_time_registry(
      'profile','fd150000-0000-4000-8000-000000000002','publish',null,null
    );
    perform public.govern_curriculum_time_registry(
      'allocation','fd160000-0000-4000-8000-000000000002','publish',null,null
    );
    perform public.govern_curriculum_time_registry(
      'profile','fd150000-0000-4000-8000-000000000003','publish',null,null
    );
    perform public.govern_curriculum_time_registry(
      'allocation','fd160000-0000-4000-8000-000000000003','publish',null,null
    );
  end;
  $chain$
  $sql$,
  'A then B then C publication succeeds through the governed profile chain'
);

select is(
  (
    select concat_ws(
      ':',
      resolution_status,
      allocation_id::text,
      periods_per_cycle::text
    )
    from public.resolve_curriculum_time_allocation(
      'fd140000-0000-4000-8000-000000000001',
      null,
      9::smallint,
      2026,
      'rotating',
      7::smallint,
      null
    )
  ),
  'resolved:fd160000-0000-4000-8000-000000000003:7',
  'terminal profile C suppresses transitive predecessor A in 2026 even though intermediate B is not effective that year'
);

select is(
  (
    select concat_ws(
      ':',
      resolution_status,
      allocation_id::text,
      periods_per_cycle::text
    )
    from public.resolve_curriculum_time_allocation(
      'fd140000-0000-4000-8000-000000000001',
      null,
      9::smallint,
      2027,
      'rotating',
      7::smallint,
      null
    )
  ),
  'resolved:fd160000-0000-4000-8000-000000000003:7',
  'terminal profile C remains the single resolver candidate when all three chain profiles cover 2027'
);

select * from finish();
rollback;
