begin;

select plan(12);

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='detention_supervision_preferences' and cmd='ALL'),0,'detention preferences have no ALL policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='detention_supervision_preferences' and cmd='SELECT'),1,'detention preferences have one SELECT policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='detention_supervision_preferences' and cmd in ('INSERT','UPDATE','DELETE')),3,'detention preferences split writes by action');

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_health_history' and cmd='ALL'),0,'health history has no ALL policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_health_history' and cmd='SELECT'),1,'health history has one SELECT policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_health_history' and cmd in ('INSERT','UPDATE','DELETE')),3,'health history split writes by action');

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_prior_school_history' and cmd='ALL'),0,'prior-school history has no ALL policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_prior_school_history' and cmd='SELECT'),1,'prior-school history has one converged SELECT policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_prior_school_history' and cmd in ('INSERT','UPDATE','DELETE')),3,'prior-school history split writes by action');

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_psychometric_records' and cmd='ALL'),0,'psychometric records have no ALL policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_psychometric_records' and cmd='SELECT'),1,'psychometric records have one SELECT policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='learner_psychometric_records' and cmd in ('INSERT','UPDATE','DELETE')),3,'psychometric records split writes by action');

select * from finish();
rollback;
