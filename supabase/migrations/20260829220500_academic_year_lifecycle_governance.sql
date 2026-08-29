-- Academic-year state is operational governance, not a cosmetic flag. Keep at most
-- one active year per school, require basic structure before activation, and block
-- closure while learners remain current in that year.

create unique index if not exists academic_years_one_active_per_school_uidx
  on public.academic_years(school_id)
  where status='active';

create or replace function public.activate_academic_year(p_academic_year_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_year public.academic_years%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_year from public.academic_years where id=p_academic_year_id for update;
  if not found then raise exception 'Academic year not found'; end if;
  if not app_private.has_school_role(v_year.school_id,array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  if v_year.status='closed' then raise exception 'Closed academic years cannot be reactivated'; end if;
  if v_year.status='active' then return true; end if;
  if not exists(select 1 from public.grades g where g.school_id=v_year.school_id and g.academic_year=v_year.year) then
    raise exception 'Configure at least one grade before activating the academic year';
  end if;
  if not exists(select 1 from public.register_classes rc where rc.school_id=v_year.school_id and rc.academic_year=v_year.year) then
    raise exception 'Configure at least one register class before activating the academic year';
  end if;
  if exists(select 1 from public.academic_years ay where ay.school_id=v_year.school_id and ay.status='active' and ay.id<>v_year.id) then
    raise exception 'Another academic year is already active for this school';
  end if;

  update public.academic_years set status='active',updated_at=now() where id=v_year.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_year.tenant_id,v_year.school_id,auth.uid(),'academic.year.activated','academic_year',v_year.id,jsonb_build_object('year',v_year.year));
  return true;
end;
$$;

create or replace function public.close_academic_year(p_academic_year_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_year public.academic_years%rowtype;
  v_current_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_year from public.academic_years where id=p_academic_year_id for update;
  if not found then raise exception 'Academic year not found'; end if;
  if not app_private.has_school_role(v_year.school_id,array['school_admin','principal','deputy_principal'])
     and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  if v_year.status='closed' then return true; end if;

  select count(*) into v_current_count
  from public.enrolments e
  where e.school_id=v_year.school_id and e.academic_year=v_year.year and e.status='current';
  if v_current_count>0 then
    raise exception 'Academic year cannot close while % learner enrolment(s) remain current',v_current_count;
  end if;

  update public.academic_terms set status='closed',updated_at=now()
  where school_id=v_year.school_id and academic_year_id=v_year.id and status<>'closed';
  update public.academic_years set status='closed',updated_at=now() where id=v_year.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_year.tenant_id,v_year.school_id,auth.uid(),'academic.year.closed','academic_year',v_year.id,jsonb_build_object('year',v_year.year));
  return true;
end;
$$;

revoke all on function public.activate_academic_year(uuid) from public,anon;
grant execute on function public.activate_academic_year(uuid) to authenticated;
revoke all on function public.close_academic_year(uuid) from public,anon;
grant execute on function public.close_academic_year(uuid) to authenticated;

comment on function public.activate_academic_year(uuid) is 'Activates one configured academic year per school only after grade/class structure exists.';
comment on function public.close_academic_year(uuid) is 'Closes an academic year only after all learner enrolments have left current status; terms close with it.';