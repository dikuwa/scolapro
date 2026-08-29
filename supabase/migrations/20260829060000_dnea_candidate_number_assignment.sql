-- DNEA examination papers and registration workflows use the official term
-- "Candidate Number" alongside a Centre Number. Candidate numbers originate from
-- the examination authority; ScolaPro stores and validates the issued value but does
-- not generate one.

alter table public.examination_candidates
  add column if not exists candidate_number_assigned_at timestamptz,
  add column if not exists candidate_number_assigned_by_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists candidate_number_source text,
  add column if not exists candidate_number_note text;

create table if not exists public.examination_candidate_number_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  examination_cycle_id uuid not null references public.examination_cycles(id) on delete cascade,
  candidate_id uuid not null references public.examination_candidates(id) on delete cascade,
  previous_candidate_number text,
  candidate_number text not null,
  centre_number text,
  source text not null default 'dnea_official' check (source in ('dnea_official','official_import','official_correction')),
  note text,
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now()
);
create index if not exists examination_candidate_number_history_candidate_idx
  on public.examination_candidate_number_history(candidate_id,assigned_at desc);
create index if not exists examination_candidate_number_history_cycle_idx
  on public.examination_candidate_number_history(examination_cycle_id,candidate_number);

alter table public.examination_candidate_number_history enable row level security;
create policy "exam staff read candidate number history"
on public.examination_candidate_number_history for select to authenticated
using (app_private.can_manage_examinations(school_id));
revoke all on public.examination_candidate_number_history from anon,authenticated;
grant select on public.examination_candidate_number_history to authenticated;

create or replace function public.assign_examination_candidate_number(
  p_candidate_id uuid,
  p_candidate_number text,
  p_centre_number text default null,
  p_source text default 'dnea_official',
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_candidate public.examination_candidates%rowtype;
  v_number text;
  v_centre text;
  v_source text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_candidate from public.examination_candidates where id=p_candidate_id for update;
  if not found then raise exception 'Examination candidate not found'; end if;
  if not app_private.can_manage_examinations(v_candidate.school_id) then raise exception 'Permission denied'; end if;

  v_number:=upper(regexp_replace(btrim(coalesce(p_candidate_number,'')),'\s+',' ','g'));
  v_centre:=nullif(upper(regexp_replace(btrim(coalesce(p_centre_number,'')),'\s+',' ','g')),'');
  v_source:=lower(btrim(coalesce(p_source,'')));
  if v_number='' then raise exception 'Candidate Number is required'; end if;
  if v_source not in ('dnea_official','official_import','official_correction') then raise exception 'Candidate Number source must be an official authority source'; end if;

  if exists(
    select 1 from public.examination_candidates ec
    where ec.examination_cycle_id=v_candidate.examination_cycle_id
      and ec.id<>v_candidate.id
      and upper(btrim(ec.candidate_number))=v_number
  ) then raise exception 'Candidate Number is already assigned in this examination cycle'; end if;

  insert into public.examination_candidate_number_history(
    tenant_id,school_id,examination_cycle_id,candidate_id,previous_candidate_number,
    candidate_number,centre_number,source,note,assigned_by_user_id
  ) values(
    v_candidate.tenant_id,v_candidate.school_id,v_candidate.examination_cycle_id,v_candidate.id,
    v_candidate.candidate_number,v_number,coalesce(v_centre,v_candidate.centre_number),v_source,
    nullif(btrim(coalesce(p_note,'')),''),auth.uid()
  );

  update public.examination_candidates
  set candidate_number=v_number,
      centre_number=coalesce(v_centre,centre_number),
      candidate_number_assigned_at=now(),
      candidate_number_assigned_by_user_id=auth.uid(),
      candidate_number_source=v_source,
      candidate_number_note=nullif(btrim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=v_candidate.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_candidate.tenant_id,v_candidate.school_id,auth.uid(),'examination.candidate_number.assigned','examination_candidate',v_candidate.id,
    jsonb_build_object('candidate_number',v_number,'centre_number',coalesce(v_centre,v_candidate.centre_number),'source',v_source));
  return true;
end;
$$;

revoke all on function public.assign_examination_candidate_number(uuid,text,text,text,text) from public,anon;
grant execute on function public.assign_examination_candidate_number(uuid,text,text,text,text) to authenticated;

comment on column public.examination_candidates.candidate_number is
'Official examination Candidate Number supplied by DNEA/authority. ScolaPro must not invent or randomly generate this value.';
