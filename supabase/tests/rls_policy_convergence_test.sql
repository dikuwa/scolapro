begin;

select plan(12);

select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='communication_recipients' and roles @> array['authenticated']::name[] and cmd='SELECT'),
  1,
  'communication recipients have one authenticated SELECT policy'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='communication_recipients' and roles @> array['authenticated']::name[] and cmd='INSERT'),
  1,
  'communication recipients have one authenticated INSERT policy'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='communication_recipients' and roles @> array['authenticated']::name[] and cmd='UPDATE'),
  1,
  'communication recipients have one authenticated UPDATE policy'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='communication_recipients' and roles @> array['authenticated']::name[] and cmd='DELETE'),
  1,
  'communication recipients have one authenticated DELETE policy'
);

select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='guardian_absence_notices' and roles @> array['authenticated']::name[] and cmd='SELECT'),
  1,
  'guardian absence notices use one combined read policy'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='guardian_absence_notice_attachments' and roles @> array['authenticated']::name[] and cmd='SELECT'),
  1,
  'guardian absence attachments use one combined read policy'
);

select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_support_cases' and policyname like 'restricted staff can manage learner support cases%'),
  0,
  'legacy broad learner support manage policies are removed'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_support_interventions' and policyname like 'restricted staff can % support interventions'),
  0,
  'legacy broad learner support intervention policies are removed'
);

select ok(
  has_table_privilege('authenticated','public.learner_support_cases','DELETE') = false,
  'authenticated users cannot delete learner support cases directly'
);
select ok(
  has_table_privilege('authenticated','public.learner_support_interventions','UPDATE') = false,
  'authenticated users cannot update support interventions directly'
);
select ok(
  has_table_privilege('authenticated','public.learner_support_interventions','DELETE') = false,
  'authenticated users cannot delete support interventions directly'
);
select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='learner_support_interventions' and policyname='authorized users append support interventions' and cmd='INSERT'),
  'authorized append-only support intervention policy remains active'
);

select * from finish();
rollback;
