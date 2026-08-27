begin;

select plan(12);

select has_table('public', 'learners', 'learners table exists');
select has_table('public', 'enrolments', 'enrolments table exists');
select has_table('public', 'school_memberships', 'school memberships table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.learners'::regclass),
  'RLS is enabled on learners'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.enrolments'::regclass),
  'RLS is enabled on enrolments'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'learners'
      and policyname = 'members can read enrolled learners'
  ),
  'learner read policy exists'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'enrolments'
      and policyname = 'members can read school enrolments'
  ),
  'enrolment read policy exists'
);

select has_index(
  'public',
  'learners',
  'learners_tenant_national_id_uidx',
  'tenant learner national ID uniqueness index exists'
);

select has_index(
  'public',
  'learners',
  'learners_tenant_birth_certificate_uidx',
  'tenant learner birth certificate uniqueness index exists'
);

select has_index(
  'public',
  'enrolments',
  'enrolments_school_year_admission_number_uidx',
  'school/year admission number uniqueness index exists'
);

select has_index(
  'public',
  'enrolments',
  'enrolments_one_current_per_learner_year_uidx',
  'one-current-enrolment uniqueness index exists'
);

select has_function(
  'public',
  'create_learner_enrolment',
  array['uuid', 'integer', 'uuid', 'uuid', 'text', 'text', 'text', 'date', 'text', 'text', 'date'],
  'atomic learner registration function exists'
);

select * from finish();
rollback;
