create or replace function app_private.enforce_pacing_plan_creator_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Pacing plan creator provenance is immutable';
  end if;

  if auth.uid() is not null
     and tg_op = 'INSERT'
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Pacing plan creator must match authenticated actor';
  end if;

  if not app_private.user_is_academic_leader(
    new.created_by_user_id,
    new.school_id
  ) then
    raise exception 'Pacing plan creator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_pacing_plan_creator_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_pacing_plan_creator_integrity() is
'Prevents pacing-plan creator provenance from being forged by authenticated or trusted/RLS-bypassing writes and keeps the original creator immutable.';

drop trigger if exists pacing_plan_creator_integrity_trg on public.pacing_plans;
create trigger pacing_plan_creator_integrity_trg
before insert or update of created_by_user_id, school_id
on public.pacing_plans
for each row execute function app_private.enforce_pacing_plan_creator_integrity();

drop policy if exists "academic leaders can manage pacing plans [insert]" on public.pacing_plans;
create policy "academic leaders can manage pacing plans [insert]"
on public.pacing_plans
for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod']
  )
);