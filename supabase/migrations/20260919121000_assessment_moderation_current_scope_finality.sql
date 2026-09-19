-- Issue #545: assessment/moderation live QA hardening.
-- Keep N11 requirements-gated. This migration only closes existing operational
-- authority/finality gaps in the already-integrated generic assessment lifecycle.

-- The current-scope migration added canonical ALL policies, but older split
-- scheme/component mutation policies remained permissive. PostgreSQL ORs
-- permissive policies, so remove the legacy paths rather than duplicating logic.
-- Keep the creator-bound INSERT policy established by current-scope hardening.
-- It carries created_by_user_id = auth.uid() in addition to current-school authority.
drop policy if exists "academic leaders can manage assessment schemes [update]" on public.assessment_schemes;
drop policy if exists "academic leaders can manage assessment schemes [delete]" on public.assessment_schemes;

drop policy if exists "academic leaders can manage assessment components [insert]" on public.assessment_components;
drop policy if exists "academic leaders can manage assessment components [update]" on public.assessment_components;
drop policy if exists "academic leaders can manage assessment components [delete]" on public.assessment_components;

-- Ordinary assessment-instance edits are pre-finality only. Submission/review/lock
-- transitions remain owned by the existing SECURITY DEFINER workflow RPCs.
drop policy if exists "scoped academic staff update assessment instances" on public.assessment_instances;
create policy "scoped academic staff update assessment instances"
on public.assessment_instances for update to authenticated
using (
  app_private.can_access_assessment_instance(id)
  and status in ('not_open','open','returned')
)
with check (
  app_private.can_manage_assessment_instance_scope(
    school_id,academic_year,subject_offering_id,register_class_id,teacher_allocation_id
  )
  and status in ('not_open','open','returned')
);

-- Working marks are append-only revisions, but new revisions must stop once the
-- assessment enters review/verified/locked. Returned assessments may be corrected.
drop policy if exists "scoped academic staff can append learner marks" on public.learner_marks;
create policy "scoped academic staff can append learner marks"
on public.learner_marks for insert to authenticated
with check (
  recorded_by_user_id=(select auth.uid())
  and app_private.can_access_assessment_instance(assessment_instance_id)
  and exists (
    select 1
    from public.assessment_instances ai
    where ai.id=assessment_instance_id
      and ai.status in ('not_open','open','returned')
  )
);

-- Defense in depth for authenticated writes through any trusted path: preserve
-- historical/trusted fixture behavior when auth.uid() is absent, but reject an
-- authenticated recorder after ordinary editing has closed.
create or replace function app_private.enforce_learner_mark_recorder_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_status text;
begin
  if auth.uid() is not null
     and new.recorded_by_user_id is distinct from auth.uid() then
    raise exception 'Learner mark recorder must match authenticated actor';
  end if;

  if not app_private.user_can_access_assessment_instance(
    new.recorded_by_user_id,
    new.assessment_instance_id
  ) then
    raise exception 'Learner mark recorder is not authorized for assessment instance';
  end if;

  if auth.uid() is not null then
    select ai.status into v_status
    from public.assessment_instances ai
    where ai.id=new.assessment_instance_id;

    if v_status not in ('not_open','open','returned') then
      raise exception 'Assessment is not open for mark editing';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_mark_recorder_integrity()
from public, anon, authenticated;

comment on function app_private.enforce_learner_mark_recorder_integrity() is
'Preserves recorder provenance/scope and permits authenticated working-mark revisions only before governed review/finality or after a governed return.';
