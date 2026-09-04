create or replace function app_private.enforce_promotion_rule_creator_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Promotion rule creator provenance is immutable';
  end if;

  if auth.uid() is not null
     and tg_op = 'INSERT'
     and new.created_by_user_id is distinct from auth.uid() then
    raise exception 'Promotion rule creator must match authenticated actor';
  end if;

  if not app_private.user_is_academic_leader(
    new.created_by_user_id,
    new.school_id
  ) then
    raise exception 'Promotion rule creator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_promotion_rule_creator_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_promotion_rule_creator_integrity() is
'Prevents promotion-rule creator provenance from being forged by authenticated or trusted/RLS-bypassing writes and keeps creator identity immutable even while the rule version remains draft.';

drop trigger if exists promotion_rule_creator_integrity_trg on public.promotion_rule_sets;
create trigger promotion_rule_creator_integrity_trg
before insert or update of created_by_user_id, school_id
on public.promotion_rule_sets
for each row execute function app_private.enforce_promotion_rule_creator_integrity();

drop policy if exists "academic leaders can manage promotion rule sets [insert]" on public.promotion_rule_sets;
create policy "academic leaders can manage promotion rule sets [insert]"
on public.promotion_rule_sets
for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and app_private.has_school_role(
    school_id,
    array['school_admin','principal','deputy_principal','hod']
  )
);