begin;

select plan(10);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections','assessment_components','assessment_scheme_candidates','assessment_schemes') and cmd='ALL'),
  0,
  'assessment/statutory targets have no remaining ALL management policies'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections','assessment_components','assessment_scheme_candidates','assessment_schemes')
     and cmd='INSERT' and policyname like '% [insert]'),
  8,
  'all eight targets have one command-specific management insert policy'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections','assessment_components','assessment_scheme_candidates','assessment_schemes')
     and cmd='UPDATE' and policyname like '% [update]'),
  8,
  'all eight targets have one command-specific management update policy'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections','assessment_components','assessment_scheme_candidates','assessment_schemes')
     and cmd='DELETE' and policyname like '% [delete]'),
  8,
  'all eight targets have one command-specific management delete policy'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections','assessment_components','assessment_scheme_candidates','assessment_schemes') and cmd='SELECT'),
  8,
  'all eight dedicated read policies remain present'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public'
     and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections')
     and cmd in ('INSERT','UPDATE','DELETE')
     and coalesce(qual,with_check,'') like '%has_platform_role%'),
  15,
  'statutory management writes preserve Platform Admin predicate'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public'
     and tablename in ('assessment_components','assessment_scheme_candidates','assessment_schemes')
     and cmd in ('INSERT','UPDATE','DELETE')
     and coalesce(qual,with_check,'') like '%can_manage_current_assessment_school%'),
  9,
  'assessment management writes preserve current-school management predicate'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename='assessment_schemes' and cmd='INSERT'),
  1,
  'assessment schemes has exactly one effective insert policy'
);

select ok(
  (select qual like '%can_read_assessment_reference_school%'
   from pg_policies
   where schemaname='public'
     and tablename='assessment_schemes'
     and policyname='academic staff can read assessment schemes'),
  'assessment scheme read policy remains the broader academic reference read boundary'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public'
     and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections')
     and cmd='SELECT'
     and qual like '%has_platform_role%'),
  5,
  'all five statutory read policies still explicitly include Platform Admin'
);

select * from finish();
rollback;
