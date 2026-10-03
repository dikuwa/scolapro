begin;

select plan(2);

select has_function(
  'public',
  'resolve_curriculum_time_allocation',
  array['uuid','text','smallint','integer','text','smallint','uuid'],
  'curriculum time resolver remains available'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values(
  'fd120000-0000-4000-8000-000000000001',
  'resolver-transitive@example.test',
  'authenticated','authenticated',now(),now()
);

insert into public.platform_memberships(user_id,role_key,active_from)
values(
  'fd120000-0000-4000-8000-000000000001',
  'platform_admin',
  current_date-10
);

insert into public.curriculum_sources(
  id,authority,source_key,title,source_url,checksum,provenance,status
) values(
  'fd130000-0000-4000-8000-000000000001',
  'NIED',
  'resolver-transitive-source',
  'Resolver Transitive Source',
  'https://example.test/resolver-transitive.pdf',
  'sha256:resolver-transitive',
  '{"fixture":"resolver-transitive"}'::jsonb,
  'verified'
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

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd120000-0000-4000-8000-000000000001',true);
set local role authenticated;

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,total_periods_per_cycle,
  effective_from_year,effective_to_year,status,provenance,supersedes_profile_id
) values
(
  'fd150000-0000-4000-8000-000000000001',
  'fd130000-0000-4000-8000-000000000001',
  'resolver-chain-a','Resolver Chain A',
  'junior_secondary','rotating',7,40,56,2030,2030,'draft',
  '{"locator":"A"}'::jsonb,
  null
),
(
  'fd150000-0000-4000-8000-000000000002',
  'fd130000-0000-4000-8000-000000000001',
  'resolver-chain-b','Resolver Chain B',
  'junior_secondary','rotating',7,40,56,2029,2029,'draft',
  '{"locator":"B"}'::jsonb,
  'fd150000-0000-4000-8000-000000000001'
),
(
  'fd150000-0000-4000-8000-000000000003',
  'fd130000-0000-4000-8000-000000000001',
  'resolver-chain-c','Resolver Chain C',
  'junior_secondary','rotating',7,40,56,2030,2030,'draft',
  '{"locator":"C"}'::jsonb,
  'fd150000-0000-4000-8000-000000000002'
);

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,
  grade_from,grade_to,periods_per_cycle,rule_strength,source_locator,status
) values
(
  'fd160000-0000-4000-8000-000000000001',
  'fd150000-0000-4000-8000-000000000001',
  'fd140000-0000-4000-8000-000000000001',
  'resolver-chain-a-g9','subject','Resolver Chain A',
  9,9,5,'prescribed','A Grade 9','draft'
),
(
  'fd160000-0000-4000-8000-000000000002',
  'fd150000-0000-4000-8000-000000000002',
  'fd140000-0000-4000-8000-000000000001',
  'resolver-chain-b-g9','subject','Resolver Chain B',
  9,9,6,'prescribed','B Grade 9','draft'
),
(
  'fd160000-0000-4000-8000-000000000003',
  'fd150000-0000-4000-8000-000000000003',
  'fd140000-0000-4000-8000-000000000001',
  'resolver-chain-c-g9','subject','Resolver Chain C',
  9,9,7,'prescribed','C Grade 9','draft'
);

update public.curriculum_time_allocations
set status='verified'
where id in (
  'fd160000-0000-4000-8000-000000000001',
  'fd160000-0000-4000-8000-000000000002',
  'fd160000-0000-4000-8000-000000000003'
);

update public.curriculum_time_profiles
set status='verified'
where id in (
  'fd150000-0000-4000-8000-000000000001',
  'fd150000-0000-4000-8000-000000000002',
  'fd150000-0000-4000-8000-000000000003'
);

update public.curriculum_time_profiles set status='published'
where id='fd150000-0000-4000-8000-000000000001';
update public.curriculum_time_allocations set status='published'
where id='fd160000-0000-4000-8000-000000000001';

update public.curriculum_time_profiles set status='published'
where id='fd150000-0000-4000-8000-000000000002';
update public.curriculum_time_allocations set status='published'
where id='fd160000-0000-4000-8000-000000000002';

update public.curriculum_time_profiles set status='published'
where id='fd150000-0000-4000-8000-000000000003';
update public.curriculum_time_allocations set status='published'
where id='fd160000-0000-4000-8000-000000000003';

select is(
  (
    select concat_ws(':',resolution_status,allocation_id::text,periods_per_cycle::text)
    from public.resolve_curriculum_time_allocation(
      'fd140000-0000-4000-8000-000000000001',
      null,
      9::smallint,
      2030,
      'rotating',
      7::smallint,
      null
    )
  ),
  'resolved:fd160000-0000-4000-8000-000000000003:7',
  'resolver honors transitive profile supersession even when the intermediate profile is outside the queried year'
);

select * from finish();
rollback;
