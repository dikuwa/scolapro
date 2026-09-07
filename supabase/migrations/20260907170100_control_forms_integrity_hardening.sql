-- N20 follow-up integrity guards kept separate so template/cycle history stays reproducible.

alter table public.control_teacher_item
  add constraint control_teacher_item_completion_provenance_ck
  check (
    (status='pending' and completed_at is null and completed_by_user_id is null)
    or
    (status<>'pending' and completed_at is not null and completed_by_user_id is not null)
  );

create or replace function app_private.enforce_control_template_version_period()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,app_private as $$
declare v_previous public.control_template%rowtype;
begin
  if new.supersedes_template_id is null then return new; end if;
  select * into v_previous from public.control_template where id=new.supersedes_template_id;
  if not found then raise exception 'Superseded control template not found'; end if;
  if v_previous.school_id<>new.school_id or v_previous.template_key<>new.template_key then
    raise exception 'Superseded control template must be the same school and template key';
  end if;
  if v_previous.status='draft' then raise exception 'A draft control template cannot be superseded'; end if;
  if v_previous.effective_to is null or new.effective_from<=v_previous.effective_to then
    raise exception 'Successor control template must start after its predecessor effective period ends';
  end if;
  return new;
end; $$;
revoke all on function app_private.enforce_control_template_version_period() from public,anon,authenticated;

create trigger control_template_version_period_trg
before insert on public.control_template
for each row execute function app_private.enforce_control_template_version_period();

create or replace function app_private.prevent_frozen_control_history_delete()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,app_private as $$
begin
  if tg_table_name='control_template' and old.status<>'draft' then
    raise exception 'Published control template versions are immutable';
  elsif tg_table_name='control_template_item' and exists(
    select 1 from public.control_template t where t.id=old.control_template_id and t.status<>'draft'
  ) then
    raise exception 'Published control template items are immutable';
  elsif tg_table_name='control_cycle' then
    raise exception 'Control cycle history cannot be deleted';
  elsif tg_table_name='control_teacher_item' and exists(
    select 1 from public.control_cycle c where c.id=old.control_cycle_id and c.status<>'open'
  ) then
    raise exception 'Completed control cycle items cannot be deleted';
  end if;
  return old;
end; $$;
revoke all on function app_private.prevent_frozen_control_history_delete() from public,anon,authenticated;

create trigger control_template_delete_guard_trg before delete on public.control_template for each row execute function app_private.prevent_frozen_control_history_delete();
create trigger control_template_item_delete_guard_trg before delete on public.control_template_item for each row execute function app_private.prevent_frozen_control_history_delete();
create trigger control_cycle_delete_guard_trg before delete on public.control_cycle for each row execute function app_private.prevent_frozen_control_history_delete();
create trigger control_teacher_item_delete_guard_trg before delete on public.control_teacher_item for each row execute function app_private.prevent_frozen_control_history_delete();