create or replace function app_private.user_is_academic_leader(
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
        and sm.role_key in ('school_admin','principal','deputy_principal','hod')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.user_is_academic_leader(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_is_academic_leader(uuid,uuid) is
'Arbitrary-user mirror of the existing assessment-scheme academic-leader authority model, including active platform administrators.';

create or replace function app_private.enforce_assessment_scheme_creator_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Assessment scheme creator provenance is immutable';
  end if;

  if auth.uid() is not null
     and tg_op = 'INSERT'
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Assessment scheme creator must match authenticated actor';
  end if;

  if not app_private.user_is_academic_leader(
    new.created_by_user_id,
    new.school_id
  ) then
    raise exception 'Assessment scheme creator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_assessment_scheme_creator_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_assessment_scheme_creator_integrity() is
'Prevents assessment-scheme creator provenance from being forged by authenticated or trusted/RLS-bypassing writes and keeps the original creator immutable.';

drop trigger if exists assessment_scheme_creator_integrity_trg on public.assessment_schemes;
create trigger assessment_scheme_creator_integrity_trg
before insert or update of created_by_user_id, school_id
on public.assessment_schemes
for each row execute function app_private.enforce_assessment_scheme_creator_integrity();

drop policy if exists "academic leaders can manage assessment schemes [insert]" on public.assessment_schemes;
create policy "academic leaders can manage assessment schemes [insert]"
on public.assessment_schemes
for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod']
  )
);