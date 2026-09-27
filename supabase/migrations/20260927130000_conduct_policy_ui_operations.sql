-- Conduct Policy Slice 2: restore and reorder operations used by the summary-first policy UI.

create or replace function app_private.can_manage_conduct_policy(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select (select auth.uid()) is not null
    and app_private.user_current_school_matches((select auth.uid()),p_school_id)
    and app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']);
$$;
revoke all on function app_private.can_manage_conduct_policy(uuid) from public,anon,authenticated;

create function public.restore_conduct_policy_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare g public.conduct_policy_groups%rowtype;
begin
  select * into g from public.conduct_policy_groups where id=p_group_id for update;
  if not found or not app_private.can_manage_conduct_policy(g.school_id) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  update public.conduct_policy_groups set active=true,updated_at=now() where id=g.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(g.tenant_id,g.school_id,(select auth.uid()),'conduct_policy.group_restored','conduct_policy_group',g.id);
end;
$$;
revoke all on function public.restore_conduct_policy_group(uuid) from public,anon;
grant execute on function public.restore_conduct_policy_group(uuid) to authenticated;

create function public.restore_conduct_policy_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare c public.conduct_policy_categories%rowtype;
begin
  select * into c from public.conduct_policy_categories where id=p_category_id for update;
  if not found or not app_private.can_manage_conduct_policy(c.school_id) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if c.group_id is not null and not exists(select 1 from public.conduct_policy_groups g where g.id=c.group_id and g.active) then
    raise exception 'Restore the conduct group before restoring this item';
  end if;
  update public.conduct_policy_categories set active=true,updated_at=now() where id=c.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(c.tenant_id,c.school_id,(select auth.uid()),'conduct_policy.restored','conduct_policy_category',c.id);
end;
$$;
revoke all on function public.restore_conduct_policy_category(uuid) from public,anon;
grant execute on function public.restore_conduct_policy_category(uuid) to authenticated;

create function public.reorder_conduct_policy_group(p_group_id uuid,p_move text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  g public.conduct_policy_groups%rowtype;
  ids uuid[];
  idx integer;
  swap_id uuid;
  i integer;
begin
  if p_move not in ('up','down') then raise exception 'Move must be up or down'; end if;
  select * into g from public.conduct_policy_groups where id=p_group_id for update;
  if not found or not app_private.can_manage_conduct_policy(g.school_id) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  select array_agg(id order by sort_order,id) into ids
  from public.conduct_policy_groups
  where school_id=g.school_id and type=g.type and active=g.active;
  idx:=array_position(ids,g.id);
  if idx is null then return; end if;
  if p_move='up' and idx>1 then
    swap_id:=ids[idx-1]; ids[idx-1]:=ids[idx]; ids[idx]:=swap_id;
  elsif p_move='down' and idx<coalesce(cardinality(ids),0) then
    swap_id:=ids[idx+1]; ids[idx+1]:=ids[idx]; ids[idx]:=swap_id;
  else
    return;
  end if;
  for i in 1..cardinality(ids) loop
    update public.conduct_policy_groups set sort_order=i*10,updated_at=now() where id=ids[i];
  end loop;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(g.tenant_id,g.school_id,(select auth.uid()),'conduct_policy.group_reordered','conduct_policy_group',g.id);
end;
$$;
revoke all on function public.reorder_conduct_policy_group(uuid,text) from public,anon;
grant execute on function public.reorder_conduct_policy_group(uuid,text) to authenticated;

create function public.reorder_conduct_policy_category(p_category_id uuid,p_move text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  c public.conduct_policy_categories%rowtype;
  ids uuid[];
  idx integer;
  swap_id uuid;
  i integer;
begin
  if p_move not in ('up','down') then raise exception 'Move must be up or down'; end if;
  select * into c from public.conduct_policy_categories where id=p_category_id for update;
  if not found or not app_private.can_manage_conduct_policy(c.school_id) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  select array_agg(id order by sort_order,id) into ids
  from public.conduct_policy_categories
  where school_id=c.school_id and group_id is not distinct from c.group_id and active=c.active;
  idx:=array_position(ids,c.id);
  if idx is null then return; end if;
  if p_move='up' and idx>1 then
    swap_id:=ids[idx-1]; ids[idx-1]:=ids[idx]; ids[idx]:=swap_id;
  elsif p_move='down' and idx<coalesce(cardinality(ids),0) then
    swap_id:=ids[idx+1]; ids[idx+1]:=ids[idx]; ids[idx]:=swap_id;
  else
    return;
  end if;
  for i in 1..cardinality(ids) loop
    update public.conduct_policy_categories set sort_order=i*10,updated_at=now() where id=ids[i];
  end loop;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
  values(c.tenant_id,c.school_id,(select auth.uid()),'conduct_policy.reordered','conduct_policy_category',c.id);
end;
$$;
revoke all on function public.reorder_conduct_policy_category(uuid,text) from public,anon;
grant execute on function public.reorder_conduct_policy_category(uuid,text) to authenticated;
