-- Communication recipients are school-scoped domain records. Keep their physical
-- relationships consistent even when a trusted service/admin path bypasses RLS.
-- App-account recipients must belong to the school either through an active school
-- membership or through a current guardian relationship to a currently enrolled learner.

create or replace function app_private.enforce_communication_recipient_identity_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_message_tenant uuid;
  v_message_school uuid;
begin
  select s.tenant_id
    into v_school_tenant
    from public.schools s
   where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Communication recipient scope mismatch: school does not belong to tenant';
  end if;

  select cm.tenant_id, cm.school_id
    into v_message_tenant, v_message_school
    from public.communication_messages cm
   where cm.id = new.message_id;

  if v_message_tenant is null then
    raise exception 'Communication recipient scope mismatch: message not found';
  end if;

  if v_message_tenant <> new.tenant_id or v_message_school <> new.school_id then
    raise exception 'Communication recipient scope mismatch: recipient does not match message school';
  end if;

  if new.learner_id is not null and not exists (
    select 1
      from public.enrolments e
     where e.tenant_id = new.tenant_id
       and e.school_id = new.school_id
       and e.learner_id = new.learner_id
       and e.status = 'current'
       and e.enrolled_from <= current_date
       and (e.enrolled_to is null or e.enrolled_to >= current_date)
  ) then
    raise exception 'Communication recipient scope mismatch: learner is not currently enrolled at school';
  end if;

  if new.staff_member_id is not null and not exists (
    select 1
      from public.staff_school_assignments ssa
     where ssa.tenant_id = new.tenant_id
       and ssa.school_id = new.school_id
       and ssa.staff_member_id = new.staff_member_id
       and ssa.effective_from <= current_date
       and (ssa.effective_to is null or ssa.effective_to >= current_date)
  ) then
    raise exception 'Communication recipient scope mismatch: staff member is not actively assigned to school';
  end if;

  if new.user_id is not null
     and not exists (
       select 1
         from public.school_memberships sm
        where sm.tenant_id = new.tenant_id
          and sm.school_id = new.school_id
          and sm.user_id = new.user_id
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
     )
     and not exists (
       select 1
         from public.guardian_user_links gul
         join public.learner_guardians lg
           on lg.tenant_id = gul.tenant_id
          and lg.guardian_id = gul.guardian_id
         join public.enrolments e
           on e.tenant_id = lg.tenant_id
          and e.learner_id = lg.learner_id
        where gul.tenant_id = new.tenant_id
          and gul.user_id = new.user_id
          and lg.effective_from <= current_date
          and (lg.effective_to is null or lg.effective_to >= current_date)
          and e.school_id = new.school_id
          and e.status = 'current'
          and e.enrolled_from <= current_date
          and (e.enrolled_to is null or e.enrolled_to >= current_date)
     ) then
    raise exception 'Communication recipient scope mismatch: user account is not currently related to school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_communication_recipient_identity_scope()
from public, anon, authenticated;

-- Recreate the existing trigger so this migration is self-contained and future schema
-- readers can see the full identity/scope contract at the latest definition.
drop trigger if exists communication_recipient_identity_scope_guard
on public.communication_recipients;
create trigger communication_recipient_identity_scope_guard
before insert or update of tenant_id, school_id, message_id, learner_id, staff_member_id, user_id
on public.communication_recipients
for each row execute function app_private.enforce_communication_recipient_identity_scope();

comment on function app_private.enforce_communication_recipient_identity_scope() is
'Physically binds a communication recipient to its message tenant/school and validates current learner, staff, and app-user relationships. An app user is eligible only through active school membership or a current guardian relationship to a currently enrolled learner.';
