-- Issue #1178: named portfolios are administrative configuration, never HOD authorization.
create table public.hod_subject_portfolios (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 school_id uuid not null references public.schools(id),
 label text not null check (char_length(btrim(label)) between 1 and 120),
 subject_ids uuid[] not null check (cardinality(subject_ids) between 1 and 100),
 created_by_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(school_id,label)
);
create table public.hod_portfolio_appointments (
 id uuid primary key default gen_random_uuid(),
 portfolio_id uuid not null references public.hod_subject_portfolios(id),
 school_id uuid not null references public.schools(id),
 staff_assignment_id uuid not null references public.staff_school_assignments(id),
 effective_from date not null,
 effective_to date,
 created_by_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check(effective_to is null or effective_to >= effective_from),
 unique(portfolio_id,effective_from)
);
-- Track exactly which appointment generated each authority row; never touch legacy/manual rows.
alter table public.subject_department_responsibilities
 add column portfolio_appointment_id uuid references public.hod_portfolio_appointments(id) on delete restrict;
create index on public.subject_department_responsibilities(portfolio_appointment_id)
 where portfolio_appointment_id is not null;
create index on public.hod_subject_portfolios(school_id);
create index on public.hod_portfolio_appointments(portfolio_id,effective_from desc);
alter table public.hod_subject_portfolios enable row level security;
alter table public.hod_portfolio_appointments enable row level security;
create policy "school staff view HOD portfolios" on public.hod_subject_portfolios for select to authenticated using (app_private.has_school_access(school_id));
create policy "school staff view HOD appointments" on public.hod_portfolio_appointments for select to authenticated using (app_private.has_school_access(school_id));
-- All writes go through explicitly authorized SECURITY DEFINER RPCs; no direct client table writes permitted.
revoke insert,update,delete on public.hod_subject_portfolios from anon,authenticated;
revoke insert,update,delete on public.hod_portfolio_appointments from anon,authenticated;
create or replace function public.create_unassigned_hod_portfolio(p_school_id uuid,p_label text,p_subject_ids uuid[])
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_id uuid; v_tenant uuid; v_unique_count integer;
begin
 if auth.uid() is null or not app_private.user_current_school_matches(auth.uid(),p_school_id)
   or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
  raise exception 'School leadership authorization required' using errcode='42501'; end if;
 if nullif(btrim(p_label),'') is null or length(btrim(p_label))>120 or p_subject_ids is null or cardinality(p_subject_ids) not between 1 and 100 then
  raise exception 'Valid label and subjects required' using errcode='22023'; end if;
 select tenant_id into v_tenant from public.schools where id=p_school_id;
 select count(distinct sid) into v_unique_count from unnest(p_subject_ids) as sid;
 if v_tenant is null or (select count(*) from public.subjects where school_id=p_school_id and tenant_id=v_tenant and id=any(p_subject_ids)) <> v_unique_count
    or v_unique_count<>cardinality(p_subject_ids) then
  raise exception 'Subject scope invalid' using errcode='22023'; end if;
 insert into public.hod_subject_portfolios(tenant_id,school_id,label,subject_ids,created_by_user_id)
 values(v_tenant,p_school_id,btrim(p_label),p_subject_ids,auth.uid()) returning id into v_id;
 return v_id;
end;$$;
create or replace function public.appoint_hod_portfolio(p_portfolio_id uuid,p_assignment_id uuid,p_effective_from date)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare v_port public.hod_subject_portfolios%rowtype; v_assignment public.staff_school_assignments%rowtype; v_id uuid; v_prev record;
begin
 select * into v_port from public.hod_subject_portfolios where id=p_portfolio_id for update;
 if v_port.id is null or auth.uid() is null or not app_private.user_current_school_matches(auth.uid(),v_port.school_id)
  or not app_private.has_school_role(v_port.school_id,array['school_admin','principal','deputy_principal']) then
  raise exception 'School leadership authorization required' using errcode='42501'; end if;
 if p_effective_from is null then raise exception 'Effective date required' using errcode='22023'; end if;
 select * into v_assignment from public.staff_school_assignments where id=p_assignment_id and school_id=v_port.school_id and tenant_id=v_port.tenant_id;
 if v_assignment.id is null or v_assignment.effective_from>p_effective_from or (v_assignment.effective_to is not null and v_assignment.effective_to<p_effective_from)
  or not exists(select 1 from public.school_memberships m join public.staff_members s on s.id=m.staff_member_id
     where m.staff_member_id=v_assignment.staff_member_id and s.status='active' and m.school_id=v_port.school_id and m.role_key='hod'
       and m.active_from<=p_effective_from and (m.active_to is null or m.active_to>=p_effective_from)) then
  raise exception 'Effective HOD placement required' using errcode='22023'; end if;
 -- End old portfolio-owned authority, but never rewrite prior history or unrelated allocations.
 for v_prev in select * from public.hod_portfolio_appointments where portfolio_id=v_port.id and effective_to is null for update loop
  if v_prev.effective_from>=p_effective_from then raise exception 'Appointment date must follow existing appointment' using errcode='22023'; end if;
  update public.hod_portfolio_appointments set effective_to=p_effective_from-1 where id=v_prev.id;
  update public.subject_department_responsibilities set effective_to=p_effective_from-1
   where portfolio_appointment_id=v_prev.id and effective_to is null;
 end loop;
 insert into public.hod_portfolio_appointments(portfolio_id,school_id,staff_assignment_id,effective_from,created_by_user_id)
 values(v_port.id,v_port.school_id,p_assignment_id,p_effective_from,auth.uid()) returning id into v_id;
 insert into public.subject_department_responsibilities(tenant_id,school_id,subject_id,department_head_staff_assignment_id,department_label,effective_from,created_by_user_id,portfolio_appointment_id)
 select v_port.tenant_id,v_port.school_id,sid,p_assignment_id,v_port.label,p_effective_from,auth.uid(),v_id from unnest(v_port.subject_ids) sid;
 return v_id;
end;$$;
-- RPCs use fixed-search-path SECURITY DEFINER to access private authorization helpers.
-- Explicit auth.uid / current-school leadership and target validity checks protect every write.
create policy "leaders create portfolios" on public.hod_subject_portfolios for insert to authenticated
with check(created_by_user_id=auth.uid() and app_private.user_current_school_matches(auth.uid(),school_id)
 and app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])
 and tenant_id=(select tenant_id from public.schools where id=school_id)
 and cardinality(subject_ids)=(select count(*) from public.subjects where subjects.school_id=hod_subject_portfolios.school_id and subjects.tenant_id=hod_subject_portfolios.tenant_id and id=any(subject_ids))
 and cardinality(subject_ids)=(select count(distinct v) from unnest(subject_ids) v));
create policy "leaders appoint portfolios" on public.hod_portfolio_appointments for insert to authenticated
with check(created_by_user_id=auth.uid() and app_private.user_current_school_matches(auth.uid(),school_id)
 and app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])
 and school_id=(select school_id from public.hod_subject_portfolios where id=portfolio_id)
 and exists(select 1 from public.staff_school_assignments a join public.school_memberships m on m.staff_member_id=a.staff_member_id
 where a.id=staff_assignment_id and a.school_id=hod_portfolio_appointments.school_id and m.school_id=hod_portfolio_appointments.school_id and m.role_key='hod'
 and a.effective_from<=hod_portfolio_appointments.effective_from and (a.effective_to is null or a.effective_to>=hod_portfolio_appointments.effective_from)
 and m.active_from<=hod_portfolio_appointments.effective_from and (m.active_to is null or m.active_to>=hod_portfolio_appointments.effective_from)));
create policy "leaders end appointments" on public.hod_portfolio_appointments for update to authenticated using(app_private.user_current_school_matches(auth.uid(),school_id) and app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal'])) with check(app_private.user_current_school_matches(auth.uid(),school_id) and app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal']));
revoke all on function public.create_unassigned_hod_portfolio(uuid,text,uuid[]) from public,anon;
revoke all on function public.appoint_hod_portfolio(uuid,uuid,date) from public,anon;
grant execute on function public.create_unassigned_hod_portfolio(uuid,text,uuid[]) to authenticated;
grant execute on function public.appoint_hod_portfolio(uuid,uuid,date) to authenticated;

-- Identity/provenance of appointment records cannot be rewritten after insert.
create function app_private.guard_hod_portfolio_appointment_history()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.id is distinct from old.id or new.portfolio_id is distinct from old.portfolio_id
 or new.school_id is distinct from old.school_id or new.staff_assignment_id is distinct from old.staff_assignment_id
 or new.effective_from is distinct from old.effective_from or new.created_by_user_id is distinct from old.created_by_user_id
 or new.created_at is distinct from old.created_at or old.effective_to is not null
 or (new.effective_to is not null and new.effective_to<old.effective_from) then
  raise exception 'Appointment provenance immutable; only close an open appointment' using errcode='23514';
 end if;
 return new;
end;$$;
create trigger guard_hod_portfolio_appointment_history before update on public.hod_portfolio_appointments
for each row execute function app_private.guard_hod_portfolio_appointment_history();
revoke all on function app_private.guard_hod_portfolio_appointment_history() from public,anon,authenticated;

-- A separate immutable-provenance guard prevents re-binding an authorization row to a different appointment.
create function app_private.guard_hod_portfolio_responsibility_link()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.portfolio_appointment_id is distinct from old.portfolio_appointment_id then
  raise exception 'Portfolio responsibility provenance cannot change' using errcode='23514';
 end if;
 return new;
end;$$;
create trigger guard_hod_portfolio_responsibility_link before update on public.subject_department_responsibilities
for each row execute function app_private.guard_hod_portfolio_responsibility_link();
revoke all on function app_private.guard_hod_portfolio_responsibility_link() from public,anon,authenticated;
