begin;

select plan(60);

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
select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='resolve_curriculum_time_allocation'
  ),
  true,
  'resolver uses a bounded SECURITY DEFINER path so terminal withdrawn successors remain visible without exposing their rows'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema='public'
      and table_name='curriculum_scheduling_constraints'
      and column_name='numeric_value'
  ),
  'YES',
  'numeric value remains nullable at storage so legacy draft rules can be repaired without invented policy values'
);

select ok(
  exists(
    select 1
    from pg_constraint c
    where c.conrelid='public.curriculum_scheduling_constraints'::regclass
      and c.conname='curriculum_scheduling_constraints_numeric_value_integer_check'
      and not c.convalidated
      and lower(pg_get_constraintdef(c.oid)) like '%numeric_value is not null%'
      and lower(pg_get_constraintdef(c.oid)) like '%numeric_value >=%'
      and lower(pg_get_constraintdef(c.oid)) like '%trunc(numeric_value)%'
  ),
  'minimum-double numeric contract protects new or updated rows without rewriting unresolved legacy drafts'
);
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
  ('f9360000-0000-4000-8000-000000000005','time-specific-policy','Time Specific Policy','junior_secondary','TSPEC','NIED',true),
  ('f9360000-0000-4000-8000-000000000006','time-shared-slot-only','Time Shared Slot Only','junior_secondary','TSHARED','NIED',true);

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
values
  ('f9390000-0000-4000-8000-000000000007','f9360000-0000-4000-8000-000000000005','General framework eligibility mapping'),
  ('f9390000-0000-4000-8000-000000000007','f9360000-0000-4000-8000-000000000006','General framework second eligible subject');

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

select is(
  (
    select concat_ws(':',resolution_status,allocation_id::text,periods_per_cycle::text)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000006',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'resolved:f9390000-0000-4000-8000-000000000007:6',
  'subject-specific successor does not suppress a shared choice slot for another eligible subject'
);

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

-- Codex/Control Room integrity remediation assertions.
set local role authenticated;
select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$update public.curriculum_sources
      set source_url='https://example.test/nied/replaced-after-publication.pdf'
    where id='f9350000-0000-4000-8000-000000000001'$$,
  'Curriculum source evidence used by final national time rules is immutable',
  'published national time rules freeze their source URL/checksum/provenance evidence'
);

select throws_ok(
  $$update public.curriculum_time_profiles
      set id='f9380000-0000-4000-8000-000000000098'
    where id='f9380000-0000-4000-8000-000000000001'$$,
  'Curriculum time registry identities are immutable',
  'published curriculum time profile id is immutable'
);

select throws_ok(
  $$update public.curriculum_time_allocations
      set id='f9390000-0000-4000-8000-000000000098'
    where id='f9390000-0000-4000-8000-000000000001'$$,
  'Curriculum time registry identities are immutable',
  'published curriculum time allocation id is immutable'
);

select throws_ok(
  $$update public.curriculum_scheduling_constraints
      set id='f93a0000-0000-4000-8000-000000000098'
    where id='f93a0000-0000-4000-8000-000000000001'$$,
  'Curriculum time registry identities are immutable',
  'published curriculum scheduling constraint id is immutable'
);

insert into public.curriculum_time_allocations(
  id,profile_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,status
) values(
  'f9390000-0000-4000-8000-000000000009','f9380000-0000-4000-8000-000000000001',
  'verified-eligibility-test','choice_slot','Verified eligibility test',9,9,3,'prescribed','Eligibility fixture','draft'
);
insert into public.curriculum_time_slot_subjects(allocation_id,curriculum_subject_id,source_locator)
values('f9390000-0000-4000-8000-000000000009','f9360000-0000-4000-8000-000000000001','Initial eligibility');
update public.curriculum_time_allocations set status='verified'
where id='f9390000-0000-4000-8000-000000000009';

select throws_ok(
  $$insert into public.curriculum_time_slot_subjects(allocation_id,curriculum_subject_id,source_locator)
    values('f9390000-0000-4000-8000-000000000009','f9360000-0000-4000-8000-000000000002','Late eligibility')$$,
  'Verified curriculum time slot eligibility is immutable; return the parent allocation to draft or create a new allocation version',
  'verified slot eligibility cannot change without re-verification'
);

select throws_ok(
  $$insert into public.curriculum_time_allocations(
      id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
      periods_per_cycle,rule_strength,source_locator,supersedes_allocation_id,status
    ) values(
      'f9390000-0000-4000-8000-000000000010','f9380000-0000-4000-8000-000000000002',
      'f9360000-0000-4000-8000-000000000004','cross-cycle-super','subject','Cross-cycle supersession',9,9,
      6,'prescribed','Cross-cycle fixture','f9390000-0000-4000-8000-000000000005','draft'
    )$$,
  'Curriculum time allocation supersession must remain within the same phase and exact cycle variant',
  '5-day allocation cannot supersede a 7-day allocation'
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,total_periods_per_cycle,
  effective_from_year,effective_to_year,status,provenance
) values(
  'f9380000-0000-4000-8000-000000000010','f9350000-0000-4000-8000-000000000001',
  'ss-7day-boundary','Senior Secondary 7-day boundary','senior_secondary','rotating',7,40,56,
  2026,2026,'draft','{"locator":"Phase boundary fixture"}'::jsonb
);

select throws_ok(
  $$insert into public.curriculum_time_allocations(
      id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
      periods_per_cycle,rule_strength,source_locator,supersedes_allocation_id,status
    ) values(
      'f9390000-0000-4000-8000-000000000018','f9380000-0000-4000-8000-000000000010',
      'f9360000-0000-4000-8000-000000000004','cross-phase-super','subject','Cross-phase supersession',9,9,
      7,'prescribed','Cross-phase fixture','f9390000-0000-4000-8000-000000000005','draft'
    )$$,
  'Curriculum time allocation supersession must remain within the same phase and exact cycle variant',
  'allocation supersession cannot cross curriculum phases even with the same exact cycle'
);

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,status
) values(
  'f9390000-0000-4000-8000-000000000011','f9380000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001','cycle-a','subject','Cycle A',10,10,5,'prescribed','Cycle A fixture','draft'
);
insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,supersedes_allocation_id,status
) values(
  'f9390000-0000-4000-8000-000000000012','f9380000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001','cycle-b','subject','Cycle B',10,10,5,'prescribed','Cycle B fixture',
  'f9390000-0000-4000-8000-000000000011','draft'
);

select throws_ok(
  $$update public.curriculum_time_allocations
      set supersedes_allocation_id='f9390000-0000-4000-8000-000000000012'
    where id='f9390000-0000-4000-8000-000000000011'$$,
  'Curriculum time allocation supersession chain cannot contain a cycle',
  'allocation supersession chains are acyclic'
);

update public.curriculum_time_allocations
set status='withdrawn'
where id='f9390000-0000-4000-8000-000000000008';

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,status
) values(
  'f9390000-0000-4000-8000-000000000013','f9380000-0000-4000-8000-000000000003',
  'f9360000-0000-4000-8000-000000000005','specific-policy-conflict','subject','Unacknowledged subject-slot overlap',9,9,
  8,'prescribed','Subject-slot conflict fixture','draft'
);
update public.curriculum_time_allocations set status='verified'
where id='f9390000-0000-4000-8000-000000000013';

select throws_ok(
  $$update public.curriculum_time_allocations
      set status='published'
    where id='f9390000-0000-4000-8000-000000000013'$$,
  'Publishing this curriculum time allocation would create an unresolved source conflict',
  'subject-specific publication detects overlap with an eligible published choice slot'
);

select throws_ok(
  $$update public.curriculum_time_allocations
      set conflict_acknowledgement_reason='Rewritten after publication'
    where id='f9390000-0000-4000-8000-000000000004'$$,
  'Published curriculum time conflict acknowledgement reason is immutable provenance',
  'published conflict acknowledgement reason cannot be rewritten'
);


-- Post-merge #1013 remediation: exact profile supersession, constraint cycles,
-- exact cycle-kind scope, and complete minimum-double-period values.

select throws_ok(
  $$insert into public.curriculum_time_profiles(
      id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
      effective_from_year,effective_to_year,supersedes_profile_id,status,provenance
    ) values(
      'f9380000-0000-4000-8000-000000000009',
      'f9350000-0000-4000-8000-000000000001',
      'bad-cross-cycle-profile',
      'Bad cross-cycle profile',
      'junior_secondary','weekday',5,40,2026,2026,
      'f9380000-0000-4000-8000-000000000001',
      'draft','{"locator":"Cross-cycle profile fixture"}'::jsonb
    )$$,
  'Curriculum time profile supersession must remain within the same phase and exact cycle variant',
  'profile supersession cannot cross exact cycle variants'
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  effective_from_year,effective_to_year,status,provenance
) values(
  'f9380000-0000-4000-8000-000000000007',
  'f9350000-0000-4000-8000-000000000001',
  'profile-cycle-a','Profile cycle A','junior_secondary','rotating',7,40,2026,2026,
  'draft','{"locator":"Profile cycle A"}'::jsonb
);
insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  effective_from_year,effective_to_year,supersedes_profile_id,status,provenance
) values(
  'f9380000-0000-4000-8000-000000000008',
  'f9350000-0000-4000-8000-000000000001',
  'profile-cycle-b','Profile cycle B','junior_secondary','rotating',7,40,2026,2026,
  'f9380000-0000-4000-8000-000000000007',
  'draft','{"locator":"Profile cycle B"}'::jsonb
);

select throws_ok(
  $$update public.curriculum_time_profiles
      set supersedes_profile_id='f9380000-0000-4000-8000-000000000008'
    where id='f9380000-0000-4000-8000-000000000007'$$,
  'Curriculum time profile supersession chain cannot contain a cycle',
  'profile supersession chains are acyclic'
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  total_periods_per_cycle,effective_from_year,effective_to_year,status,provenance
) values(
  'f9380000-0000-4000-8000-000000000005',
  'f9350000-0000-4000-8000-000000000001',
  'js-rotating-5day','Junior Secondary rotating 5-day','junior_secondary','rotating',5,40,40,
  2026,2026,'draft','{"locator":"Rotating 5-day fixture"}'::jsonb
);
update public.curriculum_time_profiles set status='verified'
where id='f9380000-0000-4000-8000-000000000005';
update public.curriculum_time_profiles set status='published'
where id='f9380000-0000-4000-8000-000000000005';

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,status
) values(
  'f9390000-0000-4000-8000-000000000014',
  'f9380000-0000-4000-8000-000000000005',
  'f9360000-0000-4000-8000-000000000002',
  'cycle-only-rotating5-g9','subject','Cycle Only rotating 5',9,9,6,'prescribed',
  'Rotating 5-day allocation fixture','draft'
);
update public.curriculum_time_allocations set status='verified'
where id='f9390000-0000-4000-8000-000000000014';
update public.curriculum_time_allocations set status='published'
where id='f9390000-0000-4000-8000-000000000014';

insert into public.curriculum_scheduling_constraints(
  id,source_id,curriculum_subject_id,constraint_key,constraint_type,
  grade_from,grade_to,cycle_kind,cycle_length,rule_strength,numeric_value,source_locator,
  effective_from_year,effective_to_year,status
) values(
  'f93a0000-0000-4000-8000-000000000002',
  'f9350000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000002',
  'cycle-only-weekday-double','min_double_periods_per_cycle',
  9,9,'weekday',5,'prescribed',2,'Weekday-only constraint fixture',2026,2026,'draft'
);
update public.curriculum_scheduling_constraints set status='verified'
where id='f93a0000-0000-4000-8000-000000000002';
update public.curriculum_scheduling_constraints set status='published'
where id='f93a0000-0000-4000-8000-000000000002';

select is(
  (
    select scheduling_constraints
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000002',null,9::smallint,2026,'rotating',5::smallint,null
    )
  ),
  '[]'::jsonb,
  'weekday subject-level constraint does not bleed into a rotating 5-day profile'
);

select ok(
  (
    select scheduling_constraints @> '[{"constraintKey":"cycle-only-weekday-double","cycleKind":"weekday","cycleLength":5}]'::jsonb
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000002',null,9::smallint,2026,'weekday',5::smallint,null
    )
  ),
  'subject-level constraint resolves only for its exact cycle kind and length'
);

insert into public.curriculum_scheduling_constraints(
  id,source_id,curriculum_subject_id,constraint_key,constraint_type,
  grade_from,grade_to,cycle_kind,cycle_length,rule_strength,numeric_value,source_locator,
  effective_from_year,effective_to_year,status
) values(
  'f93a0000-0000-4000-8000-000000000003',
  'f9350000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'constraint-cycle-a','min_double_periods_per_cycle',
  9,9,'rotating',7,'prescribed',1,'Constraint cycle A',2026,2026,'draft'
);
insert into public.curriculum_scheduling_constraints(
  id,source_id,curriculum_subject_id,constraint_key,constraint_type,
  grade_from,grade_to,cycle_kind,cycle_length,rule_strength,numeric_value,source_locator,
  effective_from_year,effective_to_year,supersedes_constraint_id,status
) values(
  'f93a0000-0000-4000-8000-000000000004',
  'f9350000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'constraint-cycle-b','min_double_periods_per_cycle',
  9,9,'rotating',7,'prescribed',1,'Constraint cycle B',2026,2026,
  'f93a0000-0000-4000-8000-000000000003','draft'
);

select throws_ok(
  $$update public.curriculum_scheduling_constraints
      set supersedes_constraint_id='f93a0000-0000-4000-8000-000000000004'
    where id='f93a0000-0000-4000-8000-000000000003'$$,
  'Curriculum scheduling constraint supersession chain cannot contain a cycle',
  'constraint supersession chains are acyclic'
);

select throws_ok(
  $$insert into public.curriculum_scheduling_constraints(
      id,source_id,curriculum_subject_id,constraint_key,constraint_type,
      grade_from,grade_to,cycle_kind,cycle_length,rule_strength,numeric_value,source_locator,
      effective_from_year,effective_to_year,status
    ) values(
      'f93a0000-0000-4000-8000-000000000005',
      'f9350000-0000-4000-8000-000000000001',
      'f9360000-0000-4000-8000-000000000001',
      'constraint-null-minimum','min_double_periods_per_cycle',
      9,9,'rotating',7,'prescribed',null,'Null minimum fixture',2026,2026,'draft'
    )$$,
  'Minimum-double-period constraints require a positive integer numeric value',
  'minimum-double-period constraint requires a numeric value'
);


insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,status
) values(
  'f9390000-0000-4000-8000-000000000016',
  'f9380000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'math-g11-g12-broad','subject','Mathematics Grade 11-12',11,12,5,'prescribed',
  'Broad predecessor scope fixture','draft'
);
update public.curriculum_time_allocations set status='verified'
where id='f9390000-0000-4000-8000-000000000016';
update public.curriculum_time_allocations set status='published'
where id='f9390000-0000-4000-8000-000000000016';

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,supersedes_allocation_id,status
) values(
  'f9390000-0000-4000-8000-000000000017',
  'f9380000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'math-g12-specific','subject','Mathematics Grade 12',12,12,6,'prescribed',
  'Narrow successor scope fixture',
  'f9390000-0000-4000-8000-000000000016','draft'
);
update public.curriculum_time_allocations set status='verified'
where id='f9390000-0000-4000-8000-000000000017';
update public.curriculum_time_allocations set status='published'
where id='f9390000-0000-4000-8000-000000000017';

select is(
  (
    select concat_ws(':',resolution_status,allocation_id::text,periods_per_cycle::text)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,11::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'resolved:f9390000-0000-4000-8000-000000000016:5',
  'narrow Grade 12 successor does not suppress Grade 11 predecessor applicability'
);

select is(
  (
    select concat_ws(':',resolution_status,allocation_id::text,periods_per_cycle::text)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,12::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'resolved:f9390000-0000-4000-8000-000000000017:6',
  'narrow Grade 12 successor suppresses predecessor only inside its own grade scope'
);

insert into public.curriculum_scheduling_constraints(
  id,source_id,curriculum_subject_id,constraint_key,constraint_type,
  grade_from,grade_to,cycle_kind,cycle_length,rule_strength,numeric_value,source_locator,
  effective_from_year,effective_to_year,status
) values(
  'f93a0000-0000-4000-8000-000000000006',
  'f9350000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'target-preserve-math','min_double_periods_per_cycle',
  9,9,'rotating',7,'prescribed',1,'Math target fixture',2026,2026,'draft'
);

select throws_ok(
  $$insert into public.curriculum_scheduling_constraints(
      id,source_id,curriculum_subject_id,constraint_key,constraint_type,
      grade_from,grade_to,cycle_kind,cycle_length,rule_strength,numeric_value,source_locator,
      effective_from_year,effective_to_year,supersedes_constraint_id,status
    ) values(
      'f93a0000-0000-4000-8000-000000000007',
      'f9350000-0000-4000-8000-000000000001',
      'f9360000-0000-4000-8000-000000000002',
      'target-preserve-other','min_double_periods_per_cycle',
      9,9,'rotating',7,'prescribed',1,'Different target fixture',2026,2026,
      'f93a0000-0000-4000-8000-000000000006','draft'
    )$$,
  'Curriculum scheduling constraint supersession must preserve its exact allocation and canonical subject/version target',
  'constraint supersession cannot erase a different canonical subject target'
);


insert into public.curriculum_scheduling_constraints(
  id,source_id,curriculum_subject_id,constraint_key,constraint_type,
  grade_from,grade_to,cycle_kind,cycle_length,rule_strength,numeric_value,source_locator,
  effective_from_year,effective_to_year,status
) values(
  'f93a0000-0000-4000-8000-000000000008',
  'f9350000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'broad-grade-constraint','min_double_periods_per_cycle',
  11,12,'rotating',7,'prescribed',1,'Broad grade constraint fixture',2026,2026,'draft'
);
update public.curriculum_scheduling_constraints set status='verified'
where id='f93a0000-0000-4000-8000-000000000008';
update public.curriculum_scheduling_constraints set status='published'
where id='f93a0000-0000-4000-8000-000000000008';

insert into public.curriculum_scheduling_constraints(
  id,source_id,curriculum_subject_id,constraint_key,constraint_type,
  grade_from,grade_to,cycle_kind,cycle_length,rule_strength,numeric_value,source_locator,
  effective_from_year,effective_to_year,supersedes_constraint_id,status
) values(
  'f93a0000-0000-4000-8000-000000000009',
  'f9350000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'narrow-grade-constraint','min_double_periods_per_cycle',
  12,12,'rotating',7,'prescribed',2,'Narrow grade constraint fixture',2026,2026,
  'f93a0000-0000-4000-8000-000000000008','draft'
);
update public.curriculum_scheduling_constraints set status='verified'
where id='f93a0000-0000-4000-8000-000000000009';
update public.curriculum_scheduling_constraints set status='published'
where id='f93a0000-0000-4000-8000-000000000009';

select ok(
  (
    select scheduling_constraints @> '[{"constraintKey":"broad-grade-constraint","numericValue":1}]'::jsonb
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,11::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'narrow Grade 12 constraint successor does not suppress Grade 11 predecessor applicability'
);

select ok(
  (
    select scheduling_constraints @> '[{"constraintKey":"narrow-grade-constraint","numericValue":2}]'::jsonb
       and not (scheduling_constraints @> '[{"constraintKey":"broad-grade-constraint"}]'::jsonb)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,12::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'narrow Grade 12 constraint successor suppresses predecessor only inside its own grade scope'
);

insert into public.curriculum_versions(
  id,curriculum_subject_id,version_key,source_id,effective_from_year,effective_to_year,status
) values(
  'f9370000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'time-math-2026-version',
  'f9350000-0000-4000-8000-000000000001',
  2026,2026,'published'
);

insert into public.curriculum_scheduling_constraints(
  id,source_id,curriculum_subject_id,curriculum_version_id,allocation_id,
  constraint_key,constraint_type,grade_from,grade_to,cycle_kind,cycle_length,
  rule_strength,numeric_value,source_locator,effective_from_year,effective_to_year,status
) values(
  'f93a0000-0000-4000-8000-000000000010',
  'f9350000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'f9370000-0000-4000-8000-000000000001',
  'f9390000-0000-4000-8000-000000000001',
  'version-linked-old','min_double_periods_per_cycle',9,9,'rotating',7,
  'prescribed',2,'Version-specific predecessor',2026,2026,'draft'
);
update public.curriculum_scheduling_constraints set status='verified'
where id='f93a0000-0000-4000-8000-000000000010';
update public.curriculum_scheduling_constraints set status='published'
where id='f93a0000-0000-4000-8000-000000000010';

insert into public.curriculum_scheduling_constraints(
  id,source_id,curriculum_subject_id,curriculum_version_id,allocation_id,
  constraint_key,constraint_type,grade_from,grade_to,cycle_kind,cycle_length,
  rule_strength,numeric_value,source_locator,effective_from_year,effective_to_year,
  supersedes_constraint_id,status
) values(
  'f93a0000-0000-4000-8000-000000000011',
  'f9350000-0000-4000-8000-000000000001',
  'f9360000-0000-4000-8000-000000000001',
  'f9370000-0000-4000-8000-000000000001',
  'f9390000-0000-4000-8000-000000000001',
  'version-linked-new','min_double_periods_per_cycle',9,9,'rotating',7,
  'prescribed',3,'Version-specific successor',2026,2026,
  'f93a0000-0000-4000-8000-000000000010','draft'
);
update public.curriculum_scheduling_constraints set status='verified'
where id='f93a0000-0000-4000-8000-000000000011';
update public.curriculum_scheduling_constraints set status='published'
where id='f93a0000-0000-4000-8000-000000000011';

select ok(
  (
    select not (scheduling_constraints @> '[{"constraintKey":"version-linked-old"}]'::jsonb)
       and not (scheduling_constraints @> '[{"constraintKey":"version-linked-new"}]'::jsonb)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'generic resolution excludes linked constraints pinned to a specific curriculum version'
);

select ok(
  (
    select scheduling_constraints @> '[{"constraintKey":"version-linked-new","numericValue":3}]'::jsonb
       and not (scheduling_constraints @> '[{"constraintKey":"version-linked-old"}]'::jsonb)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,9::smallint,2026,'rotating',7::smallint,
      'f9370000-0000-4000-8000-000000000001'
    )
  ),
  'matching version resolution applies only the linked successor constraint'
);

update public.curriculum_scheduling_constraints
set status='withdrawn'
where id='f93a0000-0000-4000-8000-000000000011';

select ok(
  (
    select not (scheduling_constraints @> '[{"constraintKey":"version-linked-old"}]'::jsonb)
       and not (scheduling_constraints @> '[{"constraintKey":"version-linked-new"}]'::jsonb)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,9::smallint,2026,'rotating',7::smallint,
      'f9370000-0000-4000-8000-000000000001'
    )
  ),
  'withdrawn version-specific successor keeps its predecessor terminal for the matching version'
);

insert into public.curriculum_time_profiles(
  id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,
  total_periods_per_cycle,effective_from_year,effective_to_year,supersedes_profile_id,status,provenance
) values(
  'f9380000-0000-4000-8000-000000000006',
  'f9350000-0000-4000-8000-000000000001',
  'js-7day-replacement','Junior Secondary 7-day replacement','junior_secondary','rotating',7,40,56,
  2026,2026,'f9380000-0000-4000-8000-000000000001','draft',
  '{"locator":"Profile replacement fixture"}'::jsonb
);
update public.curriculum_time_profiles set status='verified'
where id='f9380000-0000-4000-8000-000000000006';
update public.curriculum_time_profiles set status='superseded'
where id='f9380000-0000-4000-8000-000000000001';
update public.curriculum_time_profiles set status='published'
where id='f9380000-0000-4000-8000-000000000006';

insert into public.curriculum_time_allocations(
  id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,
  periods_per_cycle,rule_strength,source_locator,status
) values(
  'f9390000-0000-4000-8000-000000000015',
  'f9380000-0000-4000-8000-000000000006',
  'f9360000-0000-4000-8000-000000000001',
  'math-g9-replacement','subject','Mathematics replacement',9,9,9,'prescribed',
  'Replacement profile allocation fixture','draft'
);
update public.curriculum_time_allocations set status='verified'
where id='f9390000-0000-4000-8000-000000000015';
update public.curriculum_time_allocations set status='published'
where id='f9390000-0000-4000-8000-000000000015';

select is(
  (
    select concat_ws(':',resolution_status,allocation_id::text,periods_per_cycle::text)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'resolved:f9390000-0000-4000-8000-000000000015:9',
  'profile-level supersession suppresses predecessor-profile allocations without child-by-child links'
);

-- Terminal successors must remain terminal for ordinary authenticated consumers.
update public.curriculum_time_allocations
set status='withdrawn'
where id='f9390000-0000-4000-8000-000000000006';

select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000003',true);
select is(
  (
    select resolution_status
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000004',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'source_missing',
  'withdrawn allocation successor does not reactivate its superseded predecessor for ordinary authenticated users'
);
select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000001',true);

update public.curriculum_scheduling_constraints
set status='withdrawn'
where id='f93a0000-0000-4000-8000-000000000009';

select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000003',true);
select ok(
  (
    select not (scheduling_constraints @> '[{"constraintKey":"broad-grade-constraint"}]'::jsonb)
       and not (scheduling_constraints @> '[{"constraintKey":"narrow-grade-constraint"}]'::jsonb)
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,12::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'withdrawn constraint successor keeps the superseded predecessor terminal for ordinary authenticated users'
);
select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000001',true);

update public.curriculum_time_profiles
set status='withdrawn'
where id='f9380000-0000-4000-8000-000000000006';

select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000003',true);
select is(
  (
    select resolution_status
    from public.resolve_curriculum_time_allocation(
      'f9360000-0000-4000-8000-000000000001',null,9::smallint,2026,'rotating',7::smallint,null
    )
  ),
  'source_missing',
  'withdrawn profile successor does not reactivate predecessor-profile rules for ordinary authenticated users'
);
select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000001',true);

update public.curriculum_time_profiles
set status='withdrawn'
where id='f9380000-0000-4000-8000-000000000002';
update public.curriculum_scheduling_constraints
set status='withdrawn'
where id='f93a0000-0000-4000-8000-000000000001';

reset role;
select * from finish();
rollback;
