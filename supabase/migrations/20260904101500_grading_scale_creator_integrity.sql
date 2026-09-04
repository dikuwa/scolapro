create or replace function app_private.enforce_grading_scale_creator_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Grading scale creator provenance is immutable';
  end if;

  if auth.uid() is not null
     and tg_op = 'INSERT'
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Grading scale creator must match authenticated actor';
  end if;

  if not app_private.user_is_academic_leader(
    new.created_by_user_id,
    new.school_id
  ) then
    raise exception 'Grading scale creator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_grading_scale_creator_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_grading_scale_creator_integrity() is
'Prevents grading-scale creator provenance from being forged by authenticated or trusted/RLS-bypassing writes and keeps the original creator immutable.';

drop trigger if exists grading_scale_creator_integrity_trg on public.grading_scales;
create trigger grading_scale_creator_integrity_trg
before insert or update of created_by_user_id, school_id
on public.grading_scales
for each row execute function app_private.enforce_grading_scale_creator_integrity();