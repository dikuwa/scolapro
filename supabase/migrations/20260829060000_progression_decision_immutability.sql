-- Harden year-end progression decisions so reviewed work remains editable, while
-- approved/locked decisions are governed transitions rather than ordinary table edits.

create or replace function app_private.guard_year_end_progression_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('approved','locked') then
      raise exception 'Approved or locked progression decisions cannot be deleted';
    end if;
    return old;
  end if;

  if old.status = 'locked' then
    raise exception 'Locked progression decisions are immutable';
  end if;

  if old.status = 'approved' then
    if new.status <> 'locked' then
      raise exception 'Approved progression decisions may only transition to locked';
    end if;
    if new.outcome is distinct from old.outcome
       or new.rule_set_key is distinct from old.rule_set_key
       or new.rule_set_version is distinct from old.rule_set_version
       or new.rationale is distinct from old.rationale
       or new.learner_id is distinct from old.learner_id
       or new.enrolment_id is distinct from old.enrolment_id
       or new.academic_year is distinct from old.academic_year
       or new.source_grade_id is distinct from old.source_grade_id
       or new.destination_grade_code is distinct from old.destination_grade_code
       or new.decided_by_user_id is distinct from old.decided_by_user_id
       or new.decided_at is distinct from old.decided_at then
      raise exception 'Approved progression decision content is immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists year_end_progression_immutability_guard on public.year_end_progressions;
create trigger year_end_progression_immutability_guard
before update or delete on public.year_end_progressions
for each row execute function app_private.guard_year_end_progression_immutability();

-- Replace broad historical manage policies. SELECT remains governed by the
-- existing academic-leader read policy.
drop policy if exists "academic leaders can manage draft progressions [insert]" on public.year_end_progressions;
drop policy if exists "academic leaders can manage draft progressions [update]" on public.year_end_progressions;
drop policy if exists "academic leaders can manage draft progressions [delete]" on public.year_end_progressions;
drop policy if exists "academic leaders can manage draft progressions" on public.year_end_progressions;

create policy "academic leaders can create working progressions"
on public.year_end_progressions for insert to authenticated
with check (
  status in ('draft','reviewed')
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])
);

create policy "academic leaders can update working progressions"
on public.year_end_progressions for update to authenticated
using (
  status in ('draft','reviewed')
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])
)
with check (
  status in ('draft','reviewed')
  and app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal','hod'])
);

create or replace function public.approve_year_end_progression(p_progression_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progression public.year_end_progressions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_progression
  from public.year_end_progressions
  where id = p_progression_id
  for update;

  if not found then raise exception 'Progression decision not found'; end if;
  if not app_private.has_school_role(v_progression.school_id, array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;
  if v_progression.status <> 'reviewed' then
    raise exception 'Only reviewed progression decisions can be approved';
  end if;

  update public.year_end_progressions
  set status = 'approved',
      decided_by_user_id = auth.uid(),
      decided_at = now(),
      updated_at = now()
  where id = v_progression.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_progression.tenant_id,
    v_progression.school_id,
    auth.uid(),
    'progression.approved',
    'year_end_progression',
    v_progression.id,
    jsonb_build_object(
      'outcome', v_progression.outcome,
      'rule_set_key', v_progression.rule_set_key,
      'rule_set_version', v_progression.rule_set_version
    )
  );

  return true;
end;
$$;

revoke all on function public.approve_year_end_progression(uuid) from public, anon;
grant execute on function public.approve_year_end_progression(uuid) to authenticated;

comment on function public.approve_year_end_progression(uuid) is 'Governed reviewed-to-approved progression transition. Approved content is immutable and may only move to locked.';
