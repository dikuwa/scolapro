begin;

select plan(6);

select policies_are(
  'public',
  'enrolments',
  array[
    'school admins can create enrolments',
    'school admins can update enrolments',
    'scoped staff read enrolments'
  ],
  'enrolment policy set remains bounded'
);

select is(
  (select cmd from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments'),
  'SELECT',
  'fast-path policy remains read-only'
);

select ok(
  (select qual from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments')
    ilike '%has_platform_role%'
  and (select qual from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments')
    ilike '%platform_admin%',
  'governed Platform Admin keeps historical and current enrolment oversight'
);

select ok(
  (select qual from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments')
    ilike '%school_memberships%'
  and (select qual from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments')
    ilike '%school_admin%'
  and (select qual from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments')
    ilike '%social_worker%',
  'school-wide reader roles use the statement-scoped membership fast path'
);

select ok(
  (select qual from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments')
    ilike '%can_read_enrolment_row%',
  'teacher and class-scoped access keeps the existing authority fallback'
);

select ok(
  (select qual from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments')
    ilike '%status = ''current''%'
  and (select qual from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments')
    ilike '%enrolled_from <= CURRENT_DATE%'
  and (select qual from pg_policies where schemaname='public' and tablename='enrolments' and policyname='scoped staff read enrolments')
    ilike '%enrolled_to >= CURRENT_DATE%',
  'current-enrolment date boundaries remain enforced'
);

select * from finish();
rollback;
