begin;

select plan(17);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname='public'
      and policyname in (
        'academic leaders can manage pacing plans [delete]',
        'academic leaders can manage pacing plans [update]',
        'academic leaders can manage pacing items [insert]',
        'academic leaders can manage pacing items [update]',
        'academic leaders can manage pacing items [delete]',
        'scoped staff can manage teaching schedule [insert]',
        'scoped staff can manage teaching schedule [update]',
        'scoped staff can manage teaching schedule [delete]'
      )
  ),
  0,
  'all eight stale broad permissive policies are removed'
);

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='pacing_plans' and cmd='DELETE' and permissive='PERMISSIVE'),1,'pacing plans delete has one permissive author policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='pacing_plans' and cmd='DELETE' and permissive='RESTRICTIVE'),1,'pacing plans delete keeps one restrictive boundary');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='pacing_plans' and cmd='UPDATE' and permissive='PERMISSIVE'),1,'pacing plans update has one permissive author policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='pacing_plans' and cmd='UPDATE' and permissive='RESTRICTIVE'),1,'pacing plans update keeps one restrictive boundary');

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='pacing_plan_items' and cmd='INSERT' and permissive='PERMISSIVE'),1,'pacing items insert has one permissive author policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='pacing_plan_items' and cmd='INSERT' and permissive='RESTRICTIVE'),1,'pacing items insert keeps one restrictive boundary');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='pacing_plan_items' and cmd='UPDATE' and permissive='PERMISSIVE'),1,'pacing items update has one permissive author policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='pacing_plan_items' and cmd='UPDATE' and permissive='RESTRICTIVE'),1,'pacing items update keeps one restrictive boundary');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='pacing_plan_items' and cmd='DELETE' and permissive='PERMISSIVE'),1,'pacing items delete has one permissive author policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='pacing_plan_items' and cmd='DELETE' and permissive='RESTRICTIVE'),1,'pacing items delete keeps one restrictive boundary');

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='teaching_schedule_items' and cmd='INSERT' and permissive='PERMISSIVE'),1,'teaching schedule insert has one permissive author policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='teaching_schedule_items' and cmd='INSERT' and permissive='RESTRICTIVE'),1,'teaching schedule insert keeps one restrictive boundary');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='teaching_schedule_items' and cmd='UPDATE' and permissive='PERMISSIVE'),1,'teaching schedule update has one permissive author policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='teaching_schedule_items' and cmd='UPDATE' and permissive='RESTRICTIVE'),1,'teaching schedule update keeps one restrictive boundary');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='teaching_schedule_items' and cmd='DELETE' and permissive='PERMISSIVE'),1,'teaching schedule delete has one permissive author policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='teaching_schedule_items' and cmd='DELETE' and permissive='RESTRICTIVE'),1,'teaching schedule delete keeps one restrictive boundary');

select * from finish();

rollback;
