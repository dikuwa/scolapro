begin;

select plan(15);

select is(
  (select cmd from pg_policies where schemaname='public' and tablename='teacher_professional_documents' and policyname='teachers read own professional documents'),
  'SELECT',
  'teacher professional document policy remains SELECT'
);
select ok(
  (select qual like '%SELECT auth.uid()%' from pg_policies where schemaname='public' and tablename='teacher_professional_documents' and policyname='teachers read own professional documents'),
  'teacher professional document policy initplans auth.uid'
);
select is(
  (select roles::text from pg_policies where schemaname='public' and tablename='teacher_professional_documents' and policyname='teachers read own professional documents'),
  '{authenticated}',
  'teacher professional document policy remains authenticated-only'
);

select is(
  (select cmd from pg_policies where schemaname='public' and tablename='education_network_memberships' and policyname='education_network_memberships_self_read'),
  'SELECT',
  'network membership self-read remains SELECT'
);
select ok(
  (select qual like '%SELECT auth.uid()%' from pg_policies where schemaname='public' and tablename='education_network_memberships' and policyname='education_network_memberships_self_read'),
  'network membership self-read initplans auth.uid'
);
select ok(
  (select qual like '%has_platform_role%' from pg_policies where schemaname='public' and tablename='education_network_memberships' and policyname='education_network_memberships_self_read'),
  'network membership self-read preserves platform-admin predicate'
);

select is(
  (select cmd from pg_policies where schemaname='public' and tablename='examination_access_arrangements' and policyname='examination_access_arrangements_insert'),
  'INSERT',
  'examination access arrangement policy remains INSERT'
);
select ok(
  (select with_check like '%SELECT auth.uid()%' from pg_policies where schemaname='public' and tablename='examination_access_arrangements' and policyname='examination_access_arrangements_insert'),
  'examination access arrangement insert initplans auth.uid'
);
select ok(
  (select with_check like '%can_manage_examination_access_n10%' from pg_policies where schemaname='public' and tablename='examination_access_arrangements' and policyname='examination_access_arrangements_insert'),
  'examination access arrangement insert preserves management predicate'
);

select is(
  (select cmd from pg_policies where schemaname='public' and tablename='examination_access_arrangement_status_history' and policyname='examination_access_status_insert'),
  'INSERT',
  'examination access status policy remains INSERT'
);
select ok(
  (select with_check like '%SELECT auth.uid()%' from pg_policies where schemaname='public' and tablename='examination_access_arrangement_status_history' and policyname='examination_access_status_insert'),
  'examination access status insert initplans auth.uid'
);
select ok(
  (select with_check like '%can_manage_examination_access_n10%' from pg_policies where schemaname='public' and tablename='examination_access_arrangement_status_history' and policyname='examination_access_status_insert'),
  'examination access status insert preserves management predicate'
);

select is(
  (select cmd from pg_policies where schemaname='public' and tablename='operational_file_templates' and policyname='school members read active operational file templates'),
  'SELECT',
  'operational file template policy remains SELECT'
);
select ok(
  (select qual like '%SELECT auth.uid()%' from pg_policies where schemaname='public' and tablename='operational_file_templates' and policyname='school members read active operational file templates'),
  'operational file template policy initplans auth.uid'
);
select ok(
  (
    select qual like '%school_memberships%'
      and qual like '%platform_memberships%'
      and qual like '%platform_admin%'
      and qual like '%platform_support%'
    from pg_policies
    where schemaname='public'
      and tablename='operational_file_templates'
      and policyname='school members read active operational file templates'
  ),
  'operational file template policy preserves school-member and platform exclusion predicates'
);

select * from finish();

rollback;
