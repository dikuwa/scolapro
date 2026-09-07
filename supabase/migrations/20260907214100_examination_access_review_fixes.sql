-- N10 review fixes: strict school examination authority + governed status supersession.

create or replace function app_private.can_manage_examination_access_n10(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = p_school_id
        and sm.user_id = auth.uid()
        and sm.role_key in ('school_admin','principal','deputy_principal','exam_officer')
        and sm.active_from <= current_date
        and (sm.active_to is null or sm.active_to >= current_date)
    );
$$;

revoke all on function app_private.can_manage_examination_access_n10(uuid)
  from public, anon;
grant execute on function app_private.can_manage_examination_access_n10(uuid)
  to authenticated;

drop policy if exists examination_access_arrangements_read
  on public.examination_access_arrangements;
drop policy if exists examination_access_arrangements_insert
  on public.examination_access_arrangements;
drop policy if exists examination_access_status_read
  on public.examination_access_arrangement_status_history;
drop policy if exists examination_access_status_insert
  on public.examination_access_arrangement_status_history;

create policy examination_access_arrangements_read
on public.examination_access_arrangements
for select to authenticated
using (app_private.can_manage_examination_access_n10(school_id));

create policy examination_access_arrangements_insert
on public.examination_access_arrangements
for insert to authenticated
with check (
  recorded_by_user_id = auth.uid()
  and app_private.can_manage_examination_access_n10(school_id)
);

create policy examination_access_status_read
on public.examination_access_arrangement_status_history
for select to authenticated
using (app_private.can_manage_examination_access_n10(school_id));

create policy examination_access_status_insert
on public.examination_access_arrangement_status_history
for insert to authenticated
with check (
  recorded_by_user_id = auth.uid()
  and app_private.can_manage_examination_access_n10(school_id)
);

revoke update, delete on public.examination_access_arrangements from anon, authenticated;
revoke update, delete on public.examination_access_arrangement_status_history from anon, authenticated;

create or replace function public.transition_examination_access_arrangement_status(
  p_arrangement_id uuid,
  p_status_value text,
  p_source_name text,
  p_source_reference text,
  p_effective_from date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_arrangement public.examination_access_arrangements%rowtype;
  v_candidate public.examination_candidates%rowtype;
  v_current public.examination_access_arrangement_status_history%rowtype;
  v_successor_id uuid := gen_random_uuid();
  v_prior_effective_to date;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_arrangement_id is null
     or p_effective_from is null
     or p_status_value is null or btrim(p_status_value) = ''
     or p_source_name is null or btrim(p_source_name) = '' then
    raise exception 'Arrangement, successor status, source, and effective date are required';
  end if;

  select * into v_arrangement
  from public.examination_access_arrangements a
  where a.id = p_arrangement_id
  for update;

  if not found then
    raise exception 'Examination access arrangement not found';
  end if;

  if not app_private.can_manage_examination_access_n10(v_arrangement.school_id) then
    raise exception 'Permission denied';
  end if;

  select * into v_candidate
  from public.examination_candidates c
  where c.id = v_arrangement.candidate_id;

  if not found
     or (v_candidate.tenant_id, v_candidate.school_id, v_candidate.examination_cycle_id)
        is distinct from (v_arrangement.tenant_id, v_arrangement.school_id, v_arrangement.examination_cycle_id) then
    raise exception 'Examination access arrangement scope mismatch';
  end if;

  if p_effective_from < v_arrangement.effective_from
     or (v_arrangement.effective_to is not null and p_effective_from > v_arrangement.effective_to) then
    raise exception 'Successor status effective date must be within the arrangement effective period';
  end if;

  select * into v_current
  from public.examination_access_arrangement_status_history h
  where h.arrangement_id = v_arrangement.id
    and h.effective_to is null
  order by h.effective_from desc, h.id
  limit 1
  for update;

  if not found then
    raise exception 'No open examination access status exists to supersede';
  end if;

  if p_effective_from <= v_current.effective_from then
    raise exception 'Successor status effective date must be after the current status effective date';
  end if;

  if (v_current.tenant_id, v_current.school_id, v_current.examination_cycle_id, v_current.candidate_id)
     is distinct from (v_arrangement.tenant_id, v_arrangement.school_id, v_arrangement.examination_cycle_id, v_arrangement.candidate_id) then
    raise exception 'Current examination access status scope mismatch';
  end if;

  v_prior_effective_to := p_effective_from - 1;

  update public.examination_access_arrangement_status_history
  set effective_to = v_prior_effective_to
  where id = v_current.id;

  insert into public.examination_access_arrangement_status_history(
    id,
    arrangement_id,
    tenant_id,
    school_id,
    examination_cycle_id,
    candidate_id,
    status_value,
    source_name,
    source_reference,
    effective_from,
    effective_to,
    recorded_by_user_id
  ) values (
    v_successor_id,
    v_arrangement.id,
    v_arrangement.tenant_id,
    v_arrangement.school_id,
    v_arrangement.examination_cycle_id,
    v_arrangement.candidate_id,
    btrim(p_status_value),
    btrim(p_source_name),
    nullif(btrim(p_source_reference), ''),
    p_effective_from,
    v_arrangement.effective_to,
    auth.uid()
  );

  insert into public.audit_events(
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_arrangement.tenant_id,
    v_arrangement.school_id,
    auth.uid(),
    'examination_access.status.transitioned',
    'examination_access_arrangement_status',
    v_successor_id,
    jsonb_build_object(
      'arrangement_id', v_arrangement.id,
      'previous_status_id', v_current.id,
      'successor_status_id', v_successor_id,
      'previous_effective_to', v_prior_effective_to,
      'successor_effective_from', p_effective_from
    )
  );

  return v_successor_id;
end;
$$;

revoke all on function public.transition_examination_access_arrangement_status(uuid, text, text, text, date)
  from public, anon;
grant execute on function public.transition_examination_access_arrangement_status(uuid, text, text, text, date)
  to authenticated;

create or replace function public.get_candidate_examination_access_arrangements(
  p_candidate_id uuid,
  p_as_of date default current_date
)
returns table (
  arrangement_id uuid,
  arrangement_value text,
  external_code text,
  source_name text,
  source_reference text,
  effective_from date,
  effective_to date,
  status_value text,
  status_source_name text,
  status_source_reference text,
  status_effective_from date,
  status_effective_to date
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_candidate public.examination_candidates%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_candidate_id is null or p_as_of is null then raise exception 'Candidate and as-of date are required'; end if;

  select * into v_candidate
  from public.examination_candidates c
  where c.id = p_candidate_id;

  if not found then raise exception 'Examination candidate not found'; end if;
  if not app_private.can_manage_examination_access_n10(v_candidate.school_id) then raise exception 'Permission denied'; end if;

  return query
  select
    a.id,
    a.arrangement_value,
    a.external_code,
    a.source_name,
    a.source_reference,
    a.effective_from,
    a.effective_to,
    sh.status_value,
    sh.source_name,
    sh.source_reference,
    sh.effective_from,
    sh.effective_to
  from public.examination_access_arrangements a
  left join lateral (
    select h.status_value, h.source_name, h.source_reference, h.effective_from, h.effective_to
    from public.examination_access_arrangement_status_history h
    where h.arrangement_id = a.id
      and h.effective_from <= p_as_of
      and (h.effective_to is null or h.effective_to >= p_as_of)
    order by h.effective_from desc, h.id
    limit 1
  ) sh on true
  where a.candidate_id = p_candidate_id
    and a.effective_from <= p_as_of
    and (a.effective_to is null or a.effective_to >= p_as_of)
  order by a.effective_from, a.id;
end;
$$;

comment on function app_private.can_manage_examination_access_n10(uuid) is
'N10 strict school examination-management authority. Platform administration or network membership alone never grants access.';
comment on function public.transition_examination_access_arrangement_status(uuid, text, text, text, date) is
'Governed N10 status supersession: closes the current open status, inserts its successor, and records canonical audit provenance.';
