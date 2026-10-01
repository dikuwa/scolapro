begin;

select plan(7);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections') and cmd='ALL'),
  0,
  'five statutory registry targets have no remaining ALL management policies'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections')
     and cmd='INSERT' and policyname like '% [insert]'),
  5,
  'all five statutory targets have command-specific management insert policies'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections')
     and cmd='UPDATE' and policyname like '% [update]'),
  5,
  'all five statutory targets have command-specific management update policies'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections')
     and cmd='DELETE' and policyname like '% [delete]'),
  5,
  'all five statutory targets have command-specific management delete policies'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections') and cmd='SELECT'),
  5,
  'all five dedicated statutory read policies remain present'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections')
     and cmd in ('INSERT','UPDATE','DELETE')
     and coalesce(qual,with_check,'') like '%has_platform_role%'),
  15,
  'statutory management writes preserve Platform Admin predicate'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename in ('statutory_code_mappings','statutory_code_sets','statutory_codes','statutory_form_fields','statutory_form_sections')
     and cmd='SELECT' and qual like '%has_platform_role%'),
  5,
  'all five statutory read policies still explicitly include Platform Admin'
);

select * from finish();
rollback;
