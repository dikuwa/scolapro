begin;

select plan(28);

select has_table('public','curriculum_time_profiles','curriculum time profiles exist');
select has_table('public','curriculum_time_allocations','curriculum time allocations exist');
select has_table('public','curriculum_time_slot_subjects','curriculum time slot subjects exist');
select has_table('public','curriculum_scheduling_constraints','curriculum scheduling constraints exist');

select ok((select relrowsecurity from pg_class where oid='public.curriculum_time_profiles'::regclass),'time profiles use RLS');
select ok((select relrowsecurity from pg_class where oid='public.curriculum_time_allocations'::regclass),'time allocations use RLS');
select ok((select relrowsecurity from pg_class where oid='public.curriculum_time_slot_subjects'::regclass),'slot subject mappings use RLS');
select ok((select relrowsecurity from pg_class where oid='public.curriculum_scheduling_constraints'::regclass),'scheduling constraints use RLS');

select has_function('public','resolve_curriculum_time_allocation',array['uuid','text','smallint','integer','text','smallint','uuid'],'exact-cycle allocation resolver exists');
select is(has_function_privilege('anon','public.resolve_curriculum_time_allocation(uuid,text,smallint,integer,text,smallint,uuid)','EXECUTE'),false,'anon cannot resolve national time allocation');
select is(has_function_privilege('authenticated','public.resolve_curriculum_time_allocation(uuid,text,smallint,integer,text,smallint,uuid)','EXECUTE'),true,'authenticated can resolve published national time allocation');
insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('f9300000-0000-4000-8000-000000000001','time-platform@example.test','authenticated','authenticated',now(),now()),
  ('f9300000-0000-4000-8000-000000000002','time-admin@example.test','authenticated','authenticated',now(),now()),
  ('f9300000-0000-4000-8000-000000000003','time-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.platform_memberships(user_id,role_key,active_from)
values('f9300000-0000-4000-8000-000000000001','platform_admin',current_date-10);

insert into public.curriculum_sources(id,authority,source_key,title,source_url,checksum,provenance,status) values
  ('f9350000-0000-4000-8000-000000000001','NIED','time-test-source','Time Test Source','https://example.test/nied/time.pdf','sha256:time-test','{"fixture":"curriculum-time"}'::jsonb,'verified'),
  ('f9350000-0000-4000-8000-000000000002','NIED','time-bad-source','Unverified Time Source','https://example.test/nied/unverified.pdf',null,'{}'::jsonb,'discovered');

insert into public.curriculum_subjects(id,curriculum_key,display_name,phase_code,subject_code,authority,active) values
  ('f9360000-0000-4000-8000-000000000001','time-math','Time Mathematics','junior_secondary','TMATH','NIED',true),
  ('f9360000-0000-4000-8000-000000000002','time-cycle-only','Time Cycle Only','junior_secondary','TCYCLE','NIED',true),
  ('f9360000-0000-4000-8000-000000000003','time-conflict','Time Conflict','junior_secondary','TCONFLICT','NIED',true),
  ('f9360000-0000-4000-8000-000000000004','time-supersession','Time Supersession','junior_secondary','TSUPER','NIED',true),
  ('f9360000-0000-4000-8000-000000000005','time-specific-policy','Time Specific Policy','junior_secondary','TSPEC','NIED',true);

reset role;
select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000001',true);
set local role authenticated;

select throws_ok(
  $$insert into public.curriculum_time_profiles(
    id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
    effective_from_year,status
  ) values(
    'f9380000-0000-4000-8000-000000000099','f9350000-0000-4000-8000-000000000001',
    'bad-direct-published','Bad direct publication','junior_secondary','rotating',7,40,2026,'published'
  )$$,
  'Curriculum time profiles must begin in draft state',
  'profiles cannot skip draft and human verification'
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,total_periods_per_cycle,
  effective_from_year,effective_to_year,status,provenance
) values
  ('f9380000-0000-4000-8000-000000000001','f9350000-0000-4000-8000-000000000001','js-7day','Junior Secondary 7-day','junior_secondary','rotating',7,40,56,2026,2026,'draft','{"locator":"Annexe test"}'::jsonb),
  ('f9380000-0000-4000-8000-000000000002','f9350000-0000-4000-8000-000000000001','js-5day','Junior Secondary 5-day test variant','junior_secondary','weekday',5,40,40,2026,2026,'draft','{"locator":"Variant test"}'::jsonb),
  ('f9380000-0000-4000-8000-000000000003','f9350000-0000-4000-8000-000000000001','js-7day-conflict','Junior Secondary 7-day conflict','junior_secondary','rotating',7,40,56,2026,2026,'draft','{"locator":"Conflict test"}'::jsonb),
  ('f9380000-0000-4000-8000-000000000004','f9350000-0000-4000-8000-000000000002','bad-source-profile','Bad source profile','junior_secondary','rotating',7,40,56,2026,2026,'draft','{}'::jsonb);

update public.curriculum_time_profiles set status='verified'
where id in (
  'f9380000-0000-4000-8000-000000000001',
  'f9380000-0000-4000-8000-000000000002',
  'f9380000-0000-4000-8000-000000000003',
  'f9380000-0000-4000-8000-000000000004'
);

select throws_ok(
  $$update public.curriculum_time_profiles
      set title='Edited while verified'
    where id='f9380000-0000-4000-8000-000000000001'$$,
  'Verified curriculum time profile must return to draft before content is changed',
  'verified profile content cannot change without returning to draft'
);

update public.curriculum_time_profiles set status='published'
where id in (
  'f9380000-0000-4000-8000-000000000001',
  'f9380000-0000-4000-8000-000000000002',
  'f9380000-0000-4000-8000-000000000003'
);

select is(
  (select verified_by_user_id from public.curriculum_time_profiles where id='f9380000-0000-4000-8000-000000000001'),
  'f9300000-0000-4000-8000-000000000001'::uuid,
  'publishing a verified profile preserves the verifier identity'
);

select throws_ok(
  $$update public.curriculum_time_profiles
      set status='superseded'
    where id='f9380000-0000-4000-8000-000000000004'$$,
  'Curriculum time profile lifecycle transition is not allowed',
  'verified profile cannot skip publication and jump to superseded'
);

select throws_ok(
  $$update public.curriculum_time_profiles
      set status='published'
    where id='f9380000-0000-4000-8000-000000000004'$$,
  'Published curriculum time rules require a verified source with URL, checksum and provenance',
  'unverified source cannot publish a national time profile'
);

reset role;
select throws_ok(
  $$delete from public.curriculum_time_profiles
    where id='f9380000-0000-4000-8000-000000000001'$$,
  'Only draft curriculum time profiles may be deleted',
  'published time profile is immutable history'
);
set local role authenticated;

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,status
) values
  ('f9390000-0000-4000-8000-000000000001','f9380000-0000-4000-8000-000000000001','f9360000-0000-4000-8000-000000000001','math-g9','subject','Mathematics',9,9,5,'prescribed','Annexe test: Mathematics','draft'),
  ('f9390000-0000-4000-8000-000000000002','f9380000-0000-4000-8000-000000000002','f9360000-0000-4000-8000-000000000002','cycle-only-g9','subject','Cycle Only',9,9,6,'prescribed','Variant test: Cycle Only','draft'),
  ('f9390000-0000-4000-8000-000000000003','f9380000-0000-4000-8000-000000000001','f9360000-0000-4000-8000-000000000003','conflict-a','subject','Conflict A',9,9,4,'prescribed','Conflict A locator','draft'),
  ('f9390000-0000-4000-8000-000000000004','f9380000-0000-4000-8000-000000000003','f9360000-0000-4000-8000-000000000003','conflict-b','subject','Conflict B',9,9,5,'prescribed','Conflict B locator','draft'),
  ('f9390000-0000-4000-8000-000000000005','f9380000-0000-4000-8000-000000000001','f9360000-0000-4000-8000-000000000004','super-old','subject','Supersession Old',9,9,6,'prescribed','Old locator','draft'),
  ('f9390000-0000-4000-8000-000000000006','f9380000-0000-4000-8000-000000000003','f9360000-0000-4000-8000-000000000004','super-new','subject','Supersession New',9,9,7,'prescribed','New locator','draft');

update public.curriculum_time_allocations set status='verified'
where id in (
  'f9390000-0000-4000-8000-000000000001',
  'f9390000-0000-4000-8000-000000000002',
  'f9390000-0000-4000-8000-000000000003',
  'f9390000-0000-4000-8000-000000000004',
  'f9390000-0000-4000-8000-000000000005',
  'f9390000-0000-4000-8000-000000000006'
);

update public.curriculum_time_allocations set status='published'
where id in (
  'f9390000-0000-4000-8000-000000000001',
  'f9390000-0000-4000-8000-000000000002',
  'f9390000-0000-4000-8000-000000000003',
  'f9390000-0000-4000-8000-000000000005'
);

update public.curriculum_time_allocations
set conflict_acknowledgement_reason='Intentional fixture: unresolved overlapping official rules remain visible as conflict',
    status='published'
where id='f9390000-0000-4000-8000-000000000004';

update public.curriculum_time_allocations
set supersedes_allocation_id='f9390000-0000-4000-8000-000000000005',
    status='draft'
where id='f9390000-0000-4000-8000-000000000006';
update public.curriculum_time_allocations
set status='verified'
where id='f9390000-0000-4000-8000-000000000006';
update public.curriculum_time_allocations
set status='published'
where id='f9390000-0000-4000-8000-000000000006';

insert into public.curriculum_time_allocations(
  id,profile_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,status
) values(
  'f9390000-0000-4000-8000-000000000007','f9380000-0000-4000-8000-000000000001',
  'elective-slot-g9','choice_slot','Field of Study Subject 1',9,9,6,'prescribed','General framework elective slot','draft'
);

insert into public.curriculum_time_slot_subjects(allocation_id,curriculum_subject_id,source_locator)
values(
  'f9390000-0000-4000-8000-000000000007',
  'f9360000-0000-4000-8000-000000000005',
  'General framework eligibility mapping'
);

update public.curriculum_time_allocations set status='verified'
where id='f9390000-0000-4000-8000-000000000007';
update public.curriculum_time_allocations set status='published'
where id='f9390000-0000-4000-8000-000000000007';
insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,supersedes_allocation_id,status
) values(
  'f9390000-0000-4000-8000-000000000008','f9380000-0000-4000-8000-000000000003',
  'f9360000-0000-4000-8000-000000000005','specific-policy-g9','subject','Time Specific Policy',9,9,
  8,'prescribed','Later subject-specific policy','f9390000-0000-4000-8000-000000000007','draft'
);
update public.curriculum_time_allocations set status='verified'
where id='f9390000-0000-4000-8000-000000000008';
update public.curriculum_time_allocations set status='published'
where id='f9390000-0000-4000-8000-000000000008';

insert into public.curriculum_scheduling_constraints(
  id,source_id,curriculum_subject_id,allocation_id,constraint_key,constraint_type,
  grade_from,grade_to,cycle_length,rule_strength,numeric_value,source_locator,
  effective_from_year,effective_to_year,status
) values(
  'f93a0000-0000-4000-8000-000000000001',
  'f9350000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'f9390000-0000-4000-8000-000000000001',
  'math-double','min_double_periods_per_cycle',9,9,7,'prescribed',1,'Policy test: practical block',2026,2026,'draft'
);
update public.curriculum_scheduling_constraints set status='verified'
where id='f93a0000-0000-4000-8000-000000000001';
update public.curriculum_scheduling_constraints set status='published'
where id='f93a0000-0000-4000-8000-000000000001';

reset role;
select throws_ok(
  $$delete from public.curriculum_time_allocations
    where id='f9390000-0000-4000-8000-000000000001'$$,
  'Only draft curriculum time allocations may be deleted',
  'published national allocation is immutable history'
);
set local role authenticated;

reset role;
select throws_ok(
  $$delete from public.curriculum_scheduling_constraints
    where id='f93a0000-0000-4000-8000-000000000001'$$,
  'Only draft curriculum scheduling constraints may be deleted',
  'published scheduling constraint is immutable history'
);
set local role authenticated;

select is(
  (
    select concat_ws(':',resolution_status,periods_per_cycle::text,cycle_kind,cycle_length::text)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'resolved:5:rotating:7',
  'exact 7-day variant resolves without conversion'
);

select is(
  (
    select resolution_status
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,9::smallint,2026,'weekday',5::smallint,null
    )
  ),
  'cycle_variant_missing',
  'missing 5-day variant is reported instead of converting 7-day periods'
);

select ok(
  (
    select available_cycle_variants @> '[{"cycleKind":"rotating","cycleLength":7}]'::jsonb
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,9::smallint,2026,'weekday',5::smallint,null
    )
  ),
  'resolver exposes the available exact cycle variant'
);

select ok(
  (
    select scheduling_constraints @> '[{"constraintType":"min_double_periods_per_cycle","numericValue":1}]'::jsonb
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'resolved allocation returns source-backed double-period constraint'
);

select is(
  (
    select resolution_status
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000002',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'cycle_variant_missing',
  'subject with only a 5-day rule does not receive a calculated 7-day value'
);

select is(
  (
    select resolution_status
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000003',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'source_conflict',
  'overlapping published rules without supersession remain a source conflict'
);

select is(
  (
    select cardinality(conflicting_allocation_ids)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000003',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  2,
  'source conflict returns both conflicting allocation ids'
);

select is(
  (
    select concat_ws(':',resolution_status,allocation_id::text,periods_per_cycle::text)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000004',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'resolved:f9390000-0000-4000-8000-000000000006:7',
  'explicit supersession resolves the replacement instead of latest-date guessing'
);

select is(
  (
    select concat_ws(':',resolution_status,allocation_id::text,periods_per_cycle::text)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000005',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'resolved:f9390000-0000-4000-8000-000000000008:8',
  'later subject-specific policy can explicitly supersede an eligible general choice slot'
);

reset role;
select * from finish();
rollback;
