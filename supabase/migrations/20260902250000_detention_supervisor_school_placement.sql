create or replace function app_private.enforce_detention_session_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_staff_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
  ) then
    raise exception 'Detention session tenant and school are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Detention session scope mismatch: school does not belong to tenant';
  end if;

  if new.supervisor_staff_member_id is not null then
    select sm.tenant_id into v_staff_tenant
    from public.staff_members sm
    where sm.id = new.supervisor_staff_member_id;

    if v_staff_tenant is null or v_staff_tenant <> new.tenant_id then
      raise exception 'Detention session scope mismatch: supervisor does not belong to tenant';
    end if;

    if not (
      exists (
        select 1
        from public.staff_school_assignments ssa
        where ssa.staff_member_id = new.supervisor_staff_member_id
          and ssa.tenant_id = new.tenant_id
          and ssa.school_id = new.school_id
          and ssa.effective_from <= new.session_date
          and (ssa.effective_to is null or ssa.effective_to >= new.session_date)
      )
      or exists (
        select 1
        from public.school_memberships m
        where m.staff_member_id = new.supervisor_staff_member_id
          and m.tenant_id = new.tenant_id
          and m.school_id = new.school_id
          and m.active_from <= new.session_date
          and (m.active_to is null or m.active_to >= new.session_date)
      )
    ) then
      raise exception 'Detention session scope mismatch: supervisor is not assigned to school on session date';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_detention_session_scope_integrity()
from public, anon, authenticated;

drop trigger if exists detention_session_scope_integrity_trg on public.detention_sessions;
create trigger detention_session_scope_integrity_trg
before insert or update of tenant_id, school_id, session_date, supervisor_staff_member_id
on public.detention_sessions
for each row execute function app_private.enforce_detention_session_scope_integrity();

comment on function app_private.enforce_detention_session_scope_integrity() is
'Protects detention-session tenant/school scope and requires any assigned supervisor to have a governed staff placement at the session school on the session date. Both staff-school assignments and legacy staff-linked school memberships are accepted.';
