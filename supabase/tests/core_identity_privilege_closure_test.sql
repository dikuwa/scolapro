begin;

select plan(4);

select ok(
  not has_table_privilege('anon','public.learners','SELECT')
  and not has_table_privilege('anon','public.learners','INSERT')
  and not has_table_privilege('anon','public.learners','UPDATE')
  and not has_table_privilege('anon','public.learners','DELETE'),
  'anonymous role has no direct learner identity table privileges'
);

select ok(
  not has_table_privilege('anon','public.enrolments','SELECT')
  and not has_table_privilege('anon','public.enrolments','INSERT')
  and not has_table_privilege('anon','public.enrolments','UPDATE')
  and not has_table_privilege('anon','public.enrolments','DELETE'),
  'anonymous role has no direct enrolment table privileges'
);

select ok(
  not has_table_privilege('authenticated','public.learners','DELETE')
  and not has_table_privilege('authenticated','public.enrolments','DELETE'),
  'authenticated application clients cannot hard-delete learner or enrolment history'
);

select ok(
  has_table_privilege('authenticated','public.school_memberships','SELECT')
  and not has_table_privilege('authenticated','public.school_memberships','INSERT')
  and not has_table_privilege('authenticated','public.school_memberships','UPDATE')
  and not has_table_privilege('authenticated','public.school_memberships','DELETE'),
  'school membership ledger is read-only to authenticated table clients'
);

select * from finish();
rollback;
