-- Issue #649: avoid per-enrolment RLS function work for users that already
-- hold school-wide learner-read authority.
--
-- The broad-role school list is an uncorrelated subquery, so PostgreSQL builds
-- it once as an InitPlan for the statement. Teacher/class-scoped users continue
-- through the existing row-level authority function unchanged.

drop policy if exists "scoped staff read enrolments" on public.enrolments;

create policy "scoped staff read enrolments"
on public.enrolments
for select
to authenticated
using (
  status='current'
  and enrolled_from<=current_date
  and (enrolled_to is null or enrolled_to>=current_date)
  and case
    when school_id = any(
      array(
        select sm.school_id
        from public.school_memberships sm
        where sm.user_id=(select auth.uid())
          and sm.role_key in (
            'school_admin',
            'principal',
            'deputy_principal',
            'counsellor',
            'social_worker'
          )
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
      )
    ) then true
    else app_private.can_read_enrolment_row(
      school_id,
      learner_id,
      status,
      enrolled_from,
      enrolled_to
    )
  end
);

comment on policy "scoped staff read enrolments" on public.enrolments is
'Fast path for active school-wide learner readers; teacher/class-scoped access continues through can_read_enrolment_row.';
