create or replace function app_private.enforce_communication_message_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_template_tenant uuid;
  v_template_school uuid;
  v_template_channel text;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.created_by_user_id is distinct from old.created_by_user_id
  ) then
    raise exception 'Communication message scope and author are immutable';
  end if;

  select s.tenant_id
    into v_school_tenant
    from public.schools s
   where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Communication scope mismatch: school does not belong to tenant';
  end if;

  if new.template_version_id is not null then
    select t.tenant_id, t.school_id, t.channel
      into v_template_tenant, v_template_school, v_template_channel
      from public.communication_template_versions v
      join public.communication_templates t on t.id = v.template_id
     where v.id = new.template_version_id;

    if v_template_tenant is null then
      raise exception 'Communication template version not found';
    end if;

    if v_template_tenant <> new.tenant_id
       or v_template_school <> new.school_id
       or v_template_channel <> new.channel then
      raise exception 'Communication template version does not match message scope/channel';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_communication_message_scope_integrity() from public, anon, authenticated;

drop trigger if exists communication_message_scope_integrity_guard on public.communication_messages;
create trigger communication_message_scope_integrity_guard
before insert or update of tenant_id, school_id, created_by_user_id, channel, template_version_id
on public.communication_messages
for each row execute function app_private.enforce_communication_message_scope_integrity();

create or replace function app_private.enforce_communication_recipient_identity_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
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

  return new;
end;
$$;

revoke all on function app_private.enforce_communication_recipient_identity_scope() from public, anon, authenticated;

drop trigger if exists communication_recipient_identity_scope_guard on public.communication_recipients;
create trigger communication_recipient_identity_scope_guard
before insert or update of tenant_id, school_id, learner_id, staff_member_id
on public.communication_recipients
for each row execute function app_private.enforce_communication_recipient_identity_scope();
