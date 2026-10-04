begin;

select plan(24);

select has_table('public','academic_schedule_snapshots','academic schedule snapshot table exists');
select has_function(
  'public','finalize_academic_schedule_snapshot',
  array['uuid','integer','smallint','text','text','text','jsonb','jsonb','text','uuid'],
  'governed finalization RPC exists'
);
select has_column('public','academic_schedule_snapshots','scope_key','academic schedule snapshots have an immutable visible scope key');
select has_function(
  'public','finalize_academic_schedule_snapshot',
  array['uuid','integer','smallint','text','text','text','jsonb','text','jsonb','text','uuid'],
  'scoped governed finalization RPC exists'
);
select is(
  has_function_privilege(
    'service_role',
    'public.finalize_academic_schedule_snapshot(uuid,integer,smallint,text,text,text,jsonb,text,jsonb,text,uuid)',
    'EXECUTE'
  ),
  true,
  'trusted server service role can finalize an explicit visible document scope'
);

select is(
  has_function_privilege(
    'anon',
    'public.finalize_academic_schedule_snapshot(uuid,integer,smallint,text,text,text,jsonb,jsonb,text,uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous finalization is revoked'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.finalize_academic_schedule_snapshot(uuid,integer,smallint,text,text,text,jsonb,jsonb,text,uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot submit arbitrary official schedule payloads'
);

select is(
  has_function_privilege(
    'service_role',
    'public.finalize_academic_schedule_snapshot(uuid,integer,smallint,text,text,text,jsonb,jsonb,text,uuid)',
    'EXECUTE'
  ),
  true,
  'trusted server service role owns the finalization boundary'
);

insert into public.tenants(id,name,slug)
values('fe100000-0000-4000-8000-000000000001','Schedule Tenant','schedule-tenant');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values(
  'fe110000-0000-4000-8000-000000000001',
  'fe100000-0000-4000-8000-000000000001',
  'Schedule School','SCH-996','Erongo','Swakopmund'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('fe120000-0000-4000-8000-000000000001','schedule-admin@example.test','authenticated','authenticated',now(),now()),
  ('fe120000-0000-4000-8000-000000000002','schedule-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(
  id,tenant_id,school_id,user_id,role_key,active_from
) values
  (
    'fe130000-0000-4000-8000-000000000001',
    'fe100000-0000-4000-8000-000000000001',
    'fe110000-0000-4000-8000-000000000001',
    'fe120000-0000-4000-8000-000000000001',
    'school_admin',current_date-10
  ),
  (
    'fe130000-0000-4000-8000-000000000002',
    'fe100000-0000-4000-8000-000000000001',
    'fe110000-0000-4000-8000-000000000001',
    'fe120000-0000-4000-8000-000000000002',
    'teacher',current_date-10
  );

set local role service_role;

select ok(
  public.finalize_academic_schedule_snapshot(
    'fe110000-0000-4000-8000-000000000001',2026,2::smallint,
    'term_schedule','official','Term Schedule',
    '{"scheduleType":"term_schedule","basis":"official","academicYear":2026,"termNumber":2,"title":"Term Schedule","columns":["Learner"],"rows":[{"Learner":"A"}],"rowCount":1}'::jsonb,
    '{"generatedFrom":"canonical"}'::jsonb,
    null,
    'fe120000-0000-4000-8000-000000000001'::uuid
  ) is not null,
  'school administrator can finalize an official schedule'
);

select is(
  (
    select concat_ws(':',status,version::text,basis)
    from public.academic_schedule_snapshots
    where school_id='fe110000-0000-4000-8000-000000000001'
      and schedule_type='term_schedule'
  ),
  'finalized:1:official',
  'first finalized snapshot is version 1'
);

select ok(
  public.finalize_academic_schedule_snapshot(
    'fe110000-0000-4000-8000-000000000001',2026,2::smallint,
    'term_schedule','official','Term Schedule',
    '{"scheduleType":"term_schedule","basis":"official","academicYear":2026,"termNumber":2,"title":"Term Schedule","columns":["Learner"],"rows":[{"Learner":"B"}],"rowCount":1}'::jsonb,
    '{"generatedFrom":"canonical"}'::jsonb,
    'Corrected canonical evidence after governed result correction',
    'fe120000-0000-4000-8000-000000000001'::uuid
  ) is not null,
  'a later official snapshot creates a new version'
);

select is(
  (
    select string_agg(version::text||':'||status,',' order by version)
    from public.academic_schedule_snapshots
    where school_id='fe110000-0000-4000-8000-000000000001'
      and schedule_type='term_schedule'
  ),
  '1:superseded,2:finalized',
  'new finalization supersedes prior finalized evidence'
);

select throws_ok(
  $$update public.academic_schedule_snapshots
    set title='Mutated history'
    where school_id='fe110000-0000-4000-8000-000000000001'
      and version=2$$,
  'Finalized academic schedule snapshots are immutable',
  'finalized snapshot content cannot be edited'
);

select throws_ok(
  $$delete from public.academic_schedule_snapshots
    where school_id='fe110000-0000-4000-8000-000000000001'
      and version=1$$,
  'Finalized academic schedule snapshots are immutable',
  'superseded history cannot be deleted'
);

select throws_ok(
  $$select public.finalize_academic_schedule_snapshot(
    'fe110000-0000-4000-8000-000000000001',2026,2::smallint,
    'top_achievers','provisional','Top Achievers',
    '{"scheduleType":"top_achievers","basis":"provisional","academicYear":2026,"termNumber":2,"title":"Top Achievers","columns":[],"rows":[],"rowCount":0}'::jsonb,
    '{}'::jsonb,
    null,
    'fe120000-0000-4000-8000-000000000001'::uuid
  )$$,
  'Only official-basis academic schedules may be finalized',
  'provisional previews cannot be finalized as official evidence'
);

select is(
  (select supersession_reason
   from public.academic_schedule_snapshots
   where school_id='fe110000-0000-4000-8000-000000000001'
     and schedule_type='term_schedule' and version=1),
  'Corrected canonical evidence after governed result correction',
  'superseded history records the correction reason'
);

select ok(
  (select condeferrable and condeferred
   from pg_constraint
   where conrelid='public.academic_schedule_snapshots'::regclass
     and conname='academic_schedule_snapshots_superseded_by_snapshot_id_fkey'),
  'successor foreign key is deferred for atomic version replacement'
);

select throws_ok(
  $$select public.finalize_academic_schedule_snapshot(
    'fe110000-0000-4000-8000-000000000001',2026,2::smallint,
    'term_schedule','official','Term Schedule',
    '{"scheduleType":"term_schedule","basis":"official","academicYear":2026,"termNumber":2,"title":"Term Schedule","columns":[],"rows":[],"rowCount":0}'::jsonb,
    '{}'::jsonb,
    null,
    'fe120000-0000-4000-8000-000000000001'::uuid
  )$$,
  'A supersession reason is required when replacing an issued schedule',
  'replacing issued evidence requires a reason'
);

select throws_ok(
  $$select public.finalize_academic_schedule_snapshot(
    'fe110000-0000-4000-8000-000000000001',2026,2::smallint,
    'subject_failure','official','Wrong title',
    '{"scheduleType":"term_schedule","basis":"official","academicYear":2026,"termNumber":2,"title":"Wrong title","columns":[],"rows":[],"rowCount":0}'::jsonb,
    '{}'::jsonb,
    null,
    'fe120000-0000-4000-8000-000000000001'::uuid
  )$$,
  'Academic schedule payload does not match its governed scope',
  'snapshot payload is scope-bound before finalization'
);

reset role;
set local role service_role;

select throws_ok(
  $$select public.finalize_academic_schedule_snapshot(
    'fe110000-0000-4000-8000-000000000001',2026,2::smallint,
    'term_schedule','official','Term Schedule',
    '{"scheduleType":"term_schedule","basis":"official","academicYear":2026,"termNumber":2,"title":"Term Schedule","columns":[],"rows":[],"rowCount":0}'::jsonb,
    '{}'::jsonb,
    null,
    'fe120000-0000-4000-8000-000000000002'::uuid
  )$$,
  'Permission denied',
  'teacher cannot finalize school-wide official schedules'
);

reset role;
select set_config('request.jwt.claim.sub','fe120000-0000-4000-8000-000000000002',true);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.academic_schedule_snapshots
    where school_id='fe110000-0000-4000-8000-000000000001'
  ),
  0,
  'teacher cannot read school-wide finalized schedule history through RLS'
);

reset role;
select set_config('request.jwt.claim.sub','fe120000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.academic_schedule_snapshots
    where school_id='fe110000-0000-4000-8000-000000000001'
  ),
  2,
  'manager can read finalized and superseded history'
);

select is(
  (
    select count(*)::integer
    from public.audit_events
    where school_id='fe110000-0000-4000-8000-000000000001'
      and event_type='academic_schedule_finalized'
  ),
  2,
  'each finalization emits audit history'
);

select ok(
  exists(
    select 1 from pg_trigger
    where tgrelid='public.academic_schedule_snapshots'::regclass
      and tgname='academic_schedule_snapshot_immutability_trg'
      and not tgisinternal
  ),
  'physical immutability trigger is installed'
);

select * from finish();
rollback;
