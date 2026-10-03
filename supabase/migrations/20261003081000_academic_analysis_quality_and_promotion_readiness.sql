-- Issue #995: governed Academic Analysis quality symbols and canonical promotion-readiness read model.
-- Analysis remains a read layer over official/provisional results; no parallel result store is introduced.

create table if not exists public.academic_analysis_quality_symbols (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  grading_scale_id uuid not null references public.grading_scales(id) on delete restrict,
  symbol text not null,
  effective_from_year integer not null,
  effective_to_year integer,
  status text not null default 'active',
  created_by_user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_analysis_quality_symbols_symbol_nonempty
    check (nullif(btrim(symbol),'') is not null),
  constraint academic_analysis_quality_symbols_years_check
    check (
      effective_from_year between 2000 and 2200
      and (effective_to_year is null or effective_to_year between effective_from_year and 2200)
    ),
  constraint academic_analysis_quality_symbols_status_check
    check (status in ('active','inactive')),
  constraint academic_analysis_quality_symbols_unique
    unique(grading_scale_id,symbol,effective_from_year)
);

create index if not exists academic_analysis_quality_symbols_scope_idx
  on public.academic_analysis_quality_symbols(school_id,grading_scale_id,effective_from_year,effective_to_year,status);

alter table public.academic_analysis_quality_symbols enable row level security;

create or replace function app_private.guard_academic_analysis_quality_symbol()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $quality_symbol_guard$
declare
  v_scale record;
begin
  if tg_op='DELETE' then
    raise exception 'Historical quality-symbol definitions cannot be deleted; end-date or inactivate them';
  end if;

  select gs.tenant_id,gs.school_id
  into v_scale
  from public.grading_scales gs
  where gs.id=new.grading_scale_id;

  if not found
     or v_scale.tenant_id<>new.tenant_id
     or v_scale.school_id<>new.school_id then
    raise exception 'Quality-symbol definition must match its grading-scale school and tenant';
  end if;

  if tg_op='INSERT' then
    if auth.uid() is null then
      raise exception 'Authentication required';
    end if;
    new.created_by_user_id:=auth.uid();
  end if;

  new.symbol:=btrim(new.symbol);

  if tg_op='UPDATE'
     and (
       new.tenant_id is distinct from old.tenant_id
       or new.school_id is distinct from old.school_id
       or new.grading_scale_id is distinct from old.grading_scale_id
       or new.symbol is distinct from old.symbol
       or new.effective_from_year is distinct from old.effective_from_year
       or new.created_by_user_id is distinct from old.created_by_user_id
     ) then
    raise exception 'Historical quality-symbol identity is immutable; supersede with a new effective definition';
  end if;

  new.updated_at:=now();
  return new;
end;
$quality_symbol_guard$;

revoke all on function app_private.guard_academic_analysis_quality_symbol()
from public,anon,authenticated;

drop trigger if exists academic_analysis_quality_symbol_guard_trg
on public.academic_analysis_quality_symbols;
create trigger academic_analysis_quality_symbol_guard_trg
before insert or update or delete on public.academic_analysis_quality_symbols
for each row execute function app_private.guard_academic_analysis_quality_symbol();

drop policy if exists academic_analysis_quality_symbols_select
on public.academic_analysis_quality_symbols;
create policy academic_analysis_quality_symbols_select
on public.academic_analysis_quality_symbols
for select
to authenticated
using (app_private.has_school_access(school_id));

drop policy if exists academic_analysis_quality_symbols_insert
on public.academic_analysis_quality_symbols;
create policy academic_analysis_quality_symbols_insert
on public.academic_analysis_quality_symbols
for insert
to authenticated
with check (
  app_private.user_can_manage_school_settings(auth.uid(),school_id)
  and created_by_user_id=auth.uid()
);

drop policy if exists academic_analysis_quality_symbols_update
on public.academic_analysis_quality_symbols;
create policy academic_analysis_quality_symbols_update
on public.academic_analysis_quality_symbols
for update
to authenticated
using (app_private.user_can_manage_school_settings(auth.uid(),school_id))
with check (app_private.user_can_manage_school_settings(auth.uid(),school_id));

drop policy if exists academic_analysis_quality_symbols_delete
on public.academic_analysis_quality_symbols;

create or replace function public.get_academic_analysis_promotion_readiness(
  p_school_id uuid,
  p_academic_year integer
)
returns table(
  enrolment_id uuid,
  promotion_rule_set_id uuid,
  rule_set_key text,
  rule_set_version text,
  recommended_outcome text,
  passed boolean,
  failed_subjects integer,
  subject_count integer,
  overall_average numeric,
  checks jsonb,
  failures jsonb
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $promotion_readiness$
declare
  v_year_start date;
  v_year_end date;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_school_id is null or p_academic_year is null then
    raise exception 'School and academic year are required';
  end if;

  if not app_private.has_school_local_role(
    p_school_id,
    array['school_admin','principal','deputy_principal']
  ) then
    raise exception 'Permission denied';
  end if;

  select
    coalesce(ay.starts_on,make_date(p_academic_year,1,1)),
    coalesce(ay.ends_on,make_date(p_academic_year,12,31))
  into v_year_start,v_year_end
  from public.academic_years ay
  where ay.school_id=p_school_id
    and ay.year=p_academic_year
  limit 1;

  v_year_start:=coalesce(v_year_start,make_date(p_academic_year,1,1));
  v_year_end:=coalesce(v_year_end,make_date(p_academic_year,12,31));

  return query
  select
    e.id,
    prs.id,
    prs.rule_set_key,
    prs.version,
    recommendation.payload->>'recommended_outcome',
    coalesce((recommendation.payload->>'passed')::boolean,false),
    coalesce((recommendation.payload->>'failed_subjects')::integer,0),
    coalesce((recommendation.payload->>'subject_count')::integer,0),
    nullif(recommendation.payload->>'overall_average','')::numeric,
    coalesce(recommendation.payload->'checks','[]'::jsonb),
    coalesce(recommendation.payload->'failures','[]'::jsonb)
  from public.enrolments e
  join public.promotion_rule_sets prs
    on prs.school_id=e.school_id
   and prs.academic_year=e.academic_year
   and prs.grade_id=e.grade_id
   and prs.status='active'
  cross join lateral (
    select public.evaluate_promotion_recommendation_scoped_engine(e.id,prs.id) as payload
  ) recommendation
  where e.school_id=p_school_id
    and e.academic_year=p_academic_year
    and e.enrolled_from<=v_year_end
    and (e.enrolled_to is null or e.enrolled_to>=v_year_start);
end;
$promotion_readiness$;

revoke all on function public.get_academic_analysis_promotion_readiness(uuid,integer)
from public,anon;
grant execute on function public.get_academic_analysis_promotion_readiness(uuid,integer)
to authenticated;

comment on table public.academic_analysis_quality_symbols is
'Governed, effective-dated definition of which grading-scale symbols count as quality outcomes in Academic Analysis. No symbol set such as A-C is assumed by application code.';

comment on function public.get_academic_analysis_promotion_readiness(uuid,integer) is
'Read-only bulk promotion-readiness projection for school-wide leaders. HODs are intentionally excluded from this whole-school SECURITY DEFINER projection; their Academic Analysis remains constrained to governed subject responsibility. Historical cohorts are selected by overlap with the requested school academic-year dates, not current-today enrolment state. The RPC delegates every learner recommendation to the canonical promotion engine and does not create a second promotion rule implementation.';
