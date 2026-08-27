create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  year integer not null check (year between 2000 and 2200),
  status text not null default 'setup' check (status in ('setup','active','closed')),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, year),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  term_number smallint not null check (term_number between 1 and 6),
  display_name text not null,
  starts_on date,
  ends_on date,
  status text not null default 'setup' check (status in ('setup','active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, term_number),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists academic_terms_school_year_idx
  on public.academic_terms (school_id, academic_year_id, term_number);

alter table public.academic_years enable row level security;
alter table public.academic_terms enable row level security;

create policy "members can read academic years"
on public.academic_years for select
to authenticated
using (app_private.has_school_access(school_id));

create policy "members can read academic terms"
on public.academic_terms for select
to authenticated
using (app_private.has_school_access(school_id));

create or replace function public.configure_academic_year(
  p_school_id uuid,
  p_year integer,
  p_starts_on date default null,
  p_ends_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school public.schools%rowtype;
  v_year_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_school_members(p_school_id) then raise exception 'Permission denied'; end if;
  if p_year < 2000 or p_year > 2200 then raise exception 'Academic year is invalid'; end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'Academic year end date cannot be before start date'; end if;

  select * into v_school from public.schools where id = p_school_id and status = 'active';
  if not found then raise exception 'School not found or inactive'; end if;

  insert into public.academic_years (tenant_id, school_id, year, starts_on, ends_on)
  values (v_school.tenant_id, p_school_id, p_year, p_starts_on, p_ends_on)
  on conflict (school_id, year)
  do update set starts_on = excluded.starts_on, ends_on = excluded.ends_on, updated_at = now()
  returning id into v_year_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_school.tenant_id, p_school_id, auth.uid(), 'academic.year.configured', 'academic_year', v_year_id, jsonb_build_object('year', p_year));

  return v_year_id;
end;
$$;

create or replace function public.configure_academic_term(
  p_academic_year_id uuid,
  p_term_number smallint,
  p_display_name text,
  p_starts_on date default null,
  p_ends_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year public.academic_years%rowtype;
  v_term_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_year from public.academic_years where id = p_academic_year_id;
  if not found then raise exception 'Academic year not found'; end if;
  if not app_private.can_manage_school_members(v_year.school_id) then raise exception 'Permission denied'; end if;
  if p_term_number < 1 or p_term_number > 6 then raise exception 'Term number is invalid'; end if;
  if btrim(coalesce(p_display_name, '')) = '' then raise exception 'Term name is required'; end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'Term end date cannot be before start date'; end if;

  insert into public.academic_terms (tenant_id, school_id, academic_year_id, term_number, display_name, starts_on, ends_on)
  values (v_year.tenant_id, v_year.school_id, v_year.id, p_term_number, btrim(p_display_name), p_starts_on, p_ends_on)
  on conflict (academic_year_id, term_number)
  do update set display_name = excluded.display_name, starts_on = excluded.starts_on, ends_on = excluded.ends_on, updated_at = now()
  returning id into v_term_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_year.tenant_id, v_year.school_id, auth.uid(), 'academic.term.configured', 'academic_term', v_term_id, jsonb_build_object('term_number', p_term_number));

  return v_term_id;
end;
$$;

revoke all on function public.configure_academic_year(uuid,integer,date,date) from public, anon;
grant execute on function public.configure_academic_year(uuid,integer,date,date) to authenticated;
revoke all on function public.configure_academic_term(uuid,smallint,text,date,date) from public, anon;
grant execute on function public.configure_academic_term(uuid,smallint,text,date,date) to authenticated;
