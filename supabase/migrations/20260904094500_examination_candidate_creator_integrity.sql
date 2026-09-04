create or replace function app_private.user_can_manage_examinations(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal','exam_officer')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.user_can_manage_examinations(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_manage_examinations(uuid,uuid) is
'Arbitrary-user mirror of examination management authority for physical provenance guards. It intentionally mirrors can_manage_examinations without depending on auth.uid().';

create or replace function app_private.enforce_examination_candidate_creator_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Examination candidate creator provenance is immutable';
  end if;

  if auth.uid() is not null
     and tg_op = 'INSERT'
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Examination candidate creator must match authenticated actor';
  end if;

  if not app_private.user_can_manage_examinations(
    new.created_by_user_id,
    new.school_id
  ) then
    raise exception 'Examination candidate creator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_examination_candidate_creator_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_examination_candidate_creator_integrity() is
'Prevents examination-candidate creator provenance from being forged by authenticated or trusted/RLS-bypassing writes and keeps the original creator immutable.';

drop trigger if exists examination_candidate_creator_integrity_trg on public.examination_candidates;
create trigger examination_candidate_creator_integrity_trg
before insert or update of created_by_user_id, school_id
on public.examination_candidates
for each row execute function app_private.enforce_examination_candidate_creator_integrity();

drop policy if exists "exam staff can manage candidates [insert]" on public.examination_candidates;
create policy "exam staff can manage candidates [insert]"
on public.examination_candidates
for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and app_private.can_manage_examinations(school_id)
);
