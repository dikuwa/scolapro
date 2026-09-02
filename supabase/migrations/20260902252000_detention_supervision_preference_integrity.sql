create or replace function app_private.enforce_detention_supervision_preference_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school_tenant uuid;
  v_staff_tenant uuid;
begin
  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.staff_member_id is distinct from old.staff_member_id
  ) then
    raise exception 'Detention supervision preference tenant, school, and staff identity are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id=new.school_id;

  if v_school_tenant is null or v_school_tenant<>new.tenant_id then
    raise exception 'Detention supervision preference scope mismatch: school does not belong to tenant';
  end if;

  select sm.tenant_id into v_staff_tenant
  from public.staff_members sm
  where sm.id=new.staff_member_id;

  if v_staff_tenant is null or v_staff_tenant<>new.tenant_id then
    raise exception 'Detention supervision preference scope mismatch: staff does not belong to tenant';
  end if;

  if not app_private.staff_member_has_school_assignment(new.staff_member_id,new.school_id,current_date) then
    raise exception 'Detention supervision preference scope mismatch: staff is not currently assigned to school';
  end if;

  if auth.uid() is not null then
    new.updated_by_user_id:=auth.uid();
  end if;
  new.updated_at:=now();

  return new;
end;
$$;

revoke all on function app_private.enforce_detention_supervision_preference_integrity()
from public,anon,authenticated;

drop trigger if exists detention_supervision_preference_integrity_trg
on public.detention_supervision_preferences;

create trigger detention_supervision_preference_integrity_trg
before insert or update of tenant_id,school_id,staff_member_id,eligible,updated_by_user_id,updated_at
on public.detention_supervision_preferences
for each row execute function app_private.enforce_detention_supervision_preference_integrity();

comment on function app_private.enforce_detention_supervision_preference_integrity() is
'Protects detention-supervision preference tenant/school/staff provenance, requires a current governed school placement, prevents root-identity movement, and stamps authenticated writes with the actual actor.';