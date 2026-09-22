begin;

select plan(4);

select is(
  (select cmd from pg_policies where schemaname='public' and tablename='learners' and policyname='scoped staff read learner identities'),
  'SELECT',
  'learner identity fast-path policy remains read-only'
);

select ok(
  (select qual from pg_policies where schemaname='public' and tablename='learners' and policyname='scoped staff read learner identities')
    ilike '%school_memberships%'
  and (select qual from pg_policies where schemaname='public' and tablename='learners' and policyname='scoped staff read learner identities')
    ilike '%school_admin%'
  and (select qual from pg_policies where schemaname='public' and tablename='learners' and policyname='scoped staff read learner identities')
    ilike '%social_worker%',
  'school-wide reader roles use the broad learner identity fast path'
);

select ok(
  (select qual from pg_policies where schemaname='public' and tablename='learners' and policyname='scoped staff read learner identities')
    ilike '%can_read_learner_identity%',
  'teacher and class-scoped learner identity access keeps the existing authority fallback'
);

select ok(
  (select qual from pg_policies where schemaname='public' and tablename='learners' and policyname='scoped staff read learner identities')
    ilike '%status = ''current''%'
  and (select qual from pg_policies where schemaname='public' and tablename='learners' and policyname='scoped staff read learner identities')
    ilike '%enrolled_from <= CURRENT_DATE%'
  and (select qual from pg_policies where schemaname='public' and tablename='learners' and policyname='scoped staff read learner identities')
    ilike '%enrolled_to >= CURRENT_DATE%',
  'broad identity fast path is limited to current effective enrolments'
);

select * from finish();
rollback;
