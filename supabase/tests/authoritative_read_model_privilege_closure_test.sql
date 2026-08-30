begin;

select plan(5);

select ok(
  not has_table_privilege('authenticated','public.academic_years','INSERT')
  and not has_table_privilege('authenticated','public.academic_years','UPDATE')
  and not has_table_privilege('authenticated','public.academic_years','DELETE')
  and not has_table_privilege('authenticated','public.academic_terms','INSERT')
  and not has_table_privilege('authenticated','public.academic_terms','UPDATE')
  and not has_table_privilege('authenticated','public.academic_terms','DELETE'),
  'academic calendar lifecycle tables are read-only at the client table boundary'
);

select ok(
  not has_table_privilege('authenticated','public.attendance_events','INSERT')
  and not has_table_privilege('authenticated','public.attendance_events','UPDATE')
  and not has_table_privilege('authenticated','public.attendance_events','DELETE')
  and not has_table_privilege('authenticated','public.attendance_register_submissions','INSERT')
  and not has_table_privilege('authenticated','public.attendance_register_submissions','UPDATE')
  and not has_table_privilege('authenticated','public.attendance_register_submissions','DELETE')
  and not has_table_privilege('authenticated','public.subject_attendance_submissions','INSERT')
  and not has_table_privilege('authenticated','public.subject_attendance_submissions','UPDATE')
  and not has_table_privilege('authenticated','public.subject_attendance_submissions','DELETE'),
  'attendance authoritative ledgers are read-only to direct client DML'
);

select ok(
  not has_table_privilege('authenticated','public.report_card_snapshots','INSERT')
  and not has_table_privilege('authenticated','public.report_card_snapshots','UPDATE')
  and not has_table_privilege('authenticated','public.report_card_snapshots','DELETE')
  and not has_table_privilege('authenticated','public.report_card_documents','INSERT')
  and not has_table_privilege('authenticated','public.report_card_documents','UPDATE')
  and not has_table_privilege('authenticated','public.report_card_documents','DELETE'),
  'report-card artifacts are read-only to direct client DML'
);

select ok(
  not has_table_privilege('authenticated','public.school_invitations','INSERT')
  and not has_table_privilege('authenticated','public.school_invitations','UPDATE')
  and not has_table_privilege('authenticated','public.school_invitations','DELETE')
  and not has_table_privilege('authenticated','public.school_learner_identifiers','INSERT')
  and not has_table_privilege('authenticated','public.school_learner_identifiers','UPDATE')
  and not has_table_privilege('authenticated','public.school_learner_identifiers','DELETE')
  and not has_table_privilege('authenticated','public.school_admission_sequences','INSERT')
  and not has_table_privilege('authenticated','public.school_admission_sequences','UPDATE')
  and not has_table_privilege('authenticated','public.school_admission_sequences','DELETE'),
  'invitation, identifier and admission sequence workflow state is not directly mutable'
);

select ok(
  not has_table_privilege('authenticated','public.platform_memberships','INSERT')
  and not has_table_privilege('authenticated','public.platform_memberships','UPDATE')
  and not has_table_privilege('authenticated','public.platform_memberships','DELETE')
  and not has_table_privilege('authenticated','public.tenants','INSERT')
  and not has_table_privilege('authenticated','public.tenants','UPDATE')
  and not has_table_privilege('authenticated','public.tenants','DELETE'),
  'platform authorization and tenant roots are read-only to direct client DML'
);

select * from finish();
rollback;
