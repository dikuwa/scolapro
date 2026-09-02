begin;

select plan(8);

select ok(
  not has_table_privilege('authenticated','public.attendance_current','INSERT')
  and not has_table_privilege('authenticated','public.attendance_current','UPDATE')
  and not has_table_privilege('authenticated','public.attendance_current','DELETE')
  and has_table_privilege('authenticated','public.attendance_current','SELECT')
  and not has_table_privilege('authenticated','public.learner_marks_current','INSERT')
  and not has_table_privilege('authenticated','public.learner_marks_current','UPDATE')
  and not has_table_privilege('authenticated','public.learner_marks_current','DELETE')
  and has_table_privilege('authenticated','public.learner_marks_current','SELECT'),
  'current-state views are read-only client query surfaces'
);

select ok(
  not has_table_privilege('authenticated','public.attendance_reasons','INSERT')
  and not has_table_privilege('authenticated','public.attendance_reasons','UPDATE')
  and not has_table_privilege('authenticated','public.attendance_reasons','DELETE')
  and not has_table_privilege('authenticated','public.late_detention_obligations','INSERT')
  and not has_table_privilege('authenticated','public.late_detention_obligations','UPDATE')
  and not has_table_privilege('authenticated','public.late_detention_obligations','DELETE'),
  'select-only operational relations no longer advertise mutation privileges'
);

select ok(
  has_table_privilege('authenticated','public.audit_events','INSERT')
  and has_table_privilege('authenticated','public.audit_events','SELECT')
  and not has_table_privilege('authenticated','public.audit_events','UPDATE')
  and not has_table_privilege('authenticated','public.audit_events','DELETE'),
  'audit events remain append/read only at the table privilege boundary'
);

select ok(
  has_table_privilege('authenticated','public.learner_marks','INSERT')
  and has_table_privilege('authenticated','public.learner_marks','SELECT')
  and not has_table_privilege('authenticated','public.learner_marks','UPDATE')
  and not has_table_privilege('authenticated','public.learner_marks','DELETE'),
  'learner marks retain append/read semantics without unsupported update/delete grants'
);

select ok(
  has_table_privilege('authenticated','public.attendance_evidence','INSERT')
  and has_table_privilege('authenticated','public.attendance_evidence','SELECT')
  and not has_table_privilege('authenticated','public.attendance_evidence','UPDATE')
  and not has_table_privilege('authenticated','public.attendance_evidence','DELETE'),
  'registered attendance evidence is append/read only at the client table boundary'
);

select ok(
  has_table_privilege('authenticated','public.notifications','SELECT')
  and has_table_privilege('authenticated','public.notifications','UPDATE')
  and has_table_privilege('authenticated','public.notifications','DELETE')
  and not has_table_privilege('authenticated','public.notifications','INSERT'),
  'authenticated clients cannot forge notification rows'
);

select ok(
  not has_table_privilege('authenticated','public.guardian_addresses','DELETE')
  and not has_table_privilege('authenticated','public.grading_scales','DELETE')
  and not has_table_privilege('authenticated','public.user_profiles','DELETE')
  and not has_table_privilege('authenticated','public.year_end_progressions','DELETE'),
  'relations without delete RLS policies no longer carry delete grants'
);

select ok(
  not exists(
    select 1
    from information_schema.role_table_grants g
    where g.grantee='authenticated'
      and g.table_schema='public'
      and g.privilege_type in ('INSERT','UPDATE','DELETE')
      and g.table_name in (
        'daily_register_current','late_arrival_weekly_readiness','late_detention_history',
        'late_detention_open_queue','subject_attendance_current'
      )
  ),
  'remaining current/readiness views expose no authenticated mutation grants'
);

select * from finish();
rollback;
