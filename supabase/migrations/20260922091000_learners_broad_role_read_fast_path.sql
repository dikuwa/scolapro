-- Issue #649: avoid per-learner authority function work when the actor
-- already has school-wide learner-read authority.
--
-- The broad-role path is derived from current school memberships and current
-- enrolments. PostgreSQL can hash that authorized learner set once for the
-- statement. Teacher/class-scoped users retain the existing identity check.

drop policy if exists "scoped staff read learner identities" on public.learners;

create policy "scoped staff read learner identities"
on public.learners
for select
to authenticated
using (
  case
    when exists (
      select 1
      from public.enrolments e
      where e.learner_id=learners.id
        and e.school_id = any(
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
        )
        and e.status='current'
        and e.enrolled_from<=current_date
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
    ) then true
    else exists (
      select 1
      from public.enrolments e
      where e.learner_id=learners.id
        and app_private.can_read_learner_identity(e.school_id,learners.id)
    )
  end
);

comment on policy "scoped staff read learner identities" on public.learners is
'Fast path for current learners visible to active school-wide learner readers; teacher/class-scoped identity access retains can_read_learner_identity.';
