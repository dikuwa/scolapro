-- #1313: school-local grading scale configuration, no national defaults.
-- Draft creation is atomic; activation validates complete non-overlapping
-- numeric coverage. Published grading meanings are immutable.
create or replace function app_private.enforce_grading_scale_finality()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, app_private as $$
declare
  v_prev numeric(10,4) := null;
  v_step numeric(10,4);
  v_count integer := 0;
  v_band record;
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Grading scale school and creator cannot change';
  end if;
  if old.status in ('active','superseded','archived') then
    if (new.scale_key,new.version,new.display_name,new.effective_from,new.effective_to,new.decimal_places)
       is distinct from
       (old.scale_key,old.version,old.display_name,old.effective_from,old.effective_to,old.decimal_places) then
      raise exception 'Activated grading scale definition is immutable; create a new version';
    end if;
    if new.status not in (old.status,'superseded','archived') then
      raise exception 'Activated grading scale cannot return to draft or active';
    end if;
  end if;
  if new.status = 'active' and old.status is distinct from 'active' then
    if old.status <> 'draft' then raise exception 'Only a draft grading scale can be activated'; end if;
    v_step := power(10::numeric,-new.decimal_places);
    for v_band in
      select minimum_value,maximum_value from public.grading_scale_bands
      where grading_scale_id=new.id order by minimum_value
    loop
      v_count := v_count + 1;
      if v_band.maximum_value is null then raise exception 'Each grading band requires a finite maximum'; end if;
      if v_band.minimum_value < 0 or v_band.maximum_value > 100
         or mod(v_band.minimum_value / v_step,1) <> 0
         or mod(v_band.maximum_value / v_step,1) <> 0 then
        raise exception 'Grading bands must use configured precision within 0 to 100';
      end if;
      if (v_prev is null and v_band.minimum_value <> 0)
         or (v_prev is not null and v_band.minimum_value <> v_prev + v_step) then
        raise exception 'Grading bands must cover 0 to 100 with no overlaps or gaps';
      end if;
      v_prev := v_band.maximum_value;
    end loop;
    if v_count = 0 or v_prev <> 100 then
      raise exception 'Grading bands must completely cover 0 to 100';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_grading_scale_finality() from public,anon,authenticated;
drop trigger if exists grading_scale_finality_guard on public.grading_scales;
create trigger grading_scale_finality_guard
before update on public.grading_scales
for each row execute function app_private.enforce_grading_scale_finality();

create or replace function app_private.enforce_grading_band_finality()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, app_private as $$
declare v_scale_id uuid; v_status text;
begin
  v_scale_id := case when tg_op='DELETE' then old.grading_scale_id else new.grading_scale_id end;
  select status into v_status from public.grading_scales where id=v_scale_id for update;
  if v_status is distinct from 'draft' then
    raise exception 'Activated grading scale bands are immutable; create a new version';
  end if;
  if tg_op='UPDATE' and new.grading_scale_id is distinct from old.grading_scale_id then
    raise exception 'Grading band cannot move between scale versions';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_grading_band_finality() from public,anon,authenticated;
drop trigger if exists grading_band_finality_guard on public.grading_scale_bands;
create trigger grading_band_finality_guard
before insert or update or delete on public.grading_scale_bands
for each row execute function app_private.enforce_grading_band_finality();

-- Mutations are SECURITY INVOKER: the caller must satisfy existing RLS.
-- Every write is one Postgres transaction; partial bands never persist.
create or replace function public.create_school_grading_scale(
  p_school_id uuid,
  p_scale_key text,
  p_version text,
  p_display_name text,
  p_effective_from date,
  p_decimal_places smallint,
  p_bands jsonb,
  p_effective_to date default null
) returns uuid language plpgsql security invoker
set search_path = pg_catalog, public, app_private as $$
declare
  v_tenant_id uuid;
  v_id uuid;
  v_row jsonb;
  v_order integer := 0;
begin
  if auth.uid() is null
     or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'School management authority is required';
  end if;
  select tenant_id into v_tenant_id from public.schools where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;
  if coalesce(p_scale_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$'
     or length(btrim(coalesce(p_version,''))) not between 1 and 40
     or length(btrim(coalesce(p_display_name,''))) not between 2 and 160
     or p_effective_from is null
     or p_decimal_places not between 0 and 4
     or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'Invalid grading scale identification, effective period or precision';
  end if;
  if jsonb_typeof(p_bands) <> 'array'
     or jsonb_array_length(p_bands) not between 1 and 30 then
    raise exception 'Provide between 1 and 30 explicit grading bands';
  end if;
  insert into public.grading_scales(
    tenant_id,school_id,scale_key,version,display_name,effective_from,effective_to,
    decimal_places,status,created_by_user_id
  ) values(
    v_tenant_id,p_school_id,btrim(p_scale_key),btrim(p_version),
    btrim(p_display_name),p_effective_from,p_effective_to,p_decimal_places,'draft',auth.uid()
  ) returning id into v_id;

  for v_row in select value from jsonb_array_elements(p_bands) loop
    if jsonb_typeof(v_row) <> 'object'
       or jsonb_typeof(v_row->'minimum') <> 'number'
       or jsonb_typeof(v_row->'maximum') <> 'number'
       or length(btrim(coalesce(v_row->>'symbol',''))) not between 1 and 12
       or coalesce(v_row->>'classification','neutral') not in ('pass','fail','neutral') then
      raise exception 'Invalid grading band; provide numeric min/max, symbol and classification';
    end if;
    v_order := v_order+1;
    insert into public.grading_scale_bands(
      tenant_id,school_id,grading_scale_id,minimum_value,maximum_value,
      symbol,pass_classification,sort_order
    ) values(
      v_tenant_id,p_school_id,v_id,(v_row->>'minimum')::numeric,
      (v_row->>'maximum')::numeric,btrim(v_row->>'symbol'),
      coalesce(v_row->>'classification','neutral'),v_order
    );
  end loop;
  return v_id;
end;
$$;
revoke all on function public.create_school_grading_scale(uuid,text,text,text,date,smallint,jsonb,date)
  from public,anon;
grant execute on function public.create_school_grading_scale(uuid,text,text,text,date,smallint,jsonb,date)
  to authenticated;

create or replace function public.replace_school_grading_scale_draft_bands(
  p_scale_id uuid,p_bands jsonb
) returns boolean language plpgsql security invoker
set search_path = pg_catalog, public, app_private as $$
declare
  v_scale public.grading_scales%rowtype;
  v_row jsonb;
  v_order integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_scale from public.grading_scales where id=p_scale_id for update;
  if not found or not app_private.has_school_role(v_scale.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'School management authority is required';
  end if;
  if v_scale.status <> 'draft' then raise exception 'Activated grading bands are immutable'; end if;
  if jsonb_typeof(p_bands) <> 'array' or jsonb_array_length(p_bands) not between 1 and 30 then
    raise exception 'Provide between 1 and 30 explicit grading bands';
  end if;
  delete from public.grading_scale_bands where grading_scale_id=v_scale.id;
  for v_row in select value from jsonb_array_elements(p_bands) loop
    if jsonb_typeof(v_row) <> 'object'
       or jsonb_typeof(v_row->'minimum') <> 'number'
       or jsonb_typeof(v_row->'maximum') <> 'number'
       or length(btrim(coalesce(v_row->>'symbol',''))) not between 1 and 12
       or coalesce(v_row->>'classification','neutral') not in ('pass','fail','neutral') then
      raise exception 'Invalid grading band; provide numeric min/max, symbol and classification';
    end if;
    v_order:=v_order+1;
    insert into public.grading_scale_bands(
      tenant_id,school_id,grading_scale_id,minimum_value,maximum_value,
      symbol,pass_classification,sort_order
    ) values(
      v_scale.tenant_id,v_scale.school_id,v_scale.id,(v_row->>'minimum')::numeric,
      (v_row->>'maximum')::numeric,btrim(v_row->>'symbol'),
      coalesce(v_row->>'classification','neutral'),v_order
    );
  end loop;
  return true;
end;
$$;
revoke all on function public.replace_school_grading_scale_draft_bands(uuid,jsonb)
  from public,anon;
grant execute on function public.replace_school_grading_scale_draft_bands(uuid,jsonb)
  to authenticated;

create or replace function public.activate_school_grading_scale(p_scale_id uuid)
returns boolean language plpgsql security invoker
set search_path = pg_catalog, public, app_private as $$
declare v_scale public.grading_scales%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_scale from public.grading_scales where id=p_scale_id for update;
  if not found or not app_private.has_school_role(v_scale.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'School management authority is required';
  end if;
  if v_scale.status <> 'draft' then raise exception 'Only draft grading scales may be activated'; end if;
  if v_scale.effective_to is not null and v_scale.effective_to < current_date then
    raise exception 'Expired grading scale cannot be activated';
  end if;
  update public.grading_scales set status='active' where id=v_scale.id;
  if not found then raise exception 'Grading scale status did not persist'; end if;
  return true;
end;
$$;
revoke all on function public.activate_school_grading_scale(uuid) from public,anon;
grant execute on function public.activate_school_grading_scale(uuid) to authenticated;

-- Audit authoritative version creation/activation separately from ordinary
-- school operations. The trigger is private and has a fixed search path.
create or replace function app_private.audit_grading_scale_lifecycle()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, app_private as $$
declare v_event text;
begin
  if tg_op='INSERT' then
    v_event:='assessment.grading_scale.draft_created';
  elsif new.status is distinct from old.status then
    v_event:='assessment.grading_scale.' || new.status;
  else
    return new;
  end if;
  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    new.tenant_id,new.school_id,coalesce(auth.uid(),new.created_by_user_id),
    v_event,'grading_scale',new.id,
    jsonb_build_object('scale_key',new.scale_key,'version',new.version,'status',new.status)
  );
  return new;
end;
$$;
revoke all on function app_private.audit_grading_scale_lifecycle() from public,anon,authenticated;
drop trigger if exists grading_scale_lifecycle_audit_trg on public.grading_scales;
create trigger grading_scale_lifecycle_audit_trg
after insert or update of status on public.grading_scales
for each row execute function app_private.audit_grading_scale_lifecycle();
