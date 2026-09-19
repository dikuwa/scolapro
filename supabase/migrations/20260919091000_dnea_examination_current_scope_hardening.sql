-- Issue #521: current-school/current-enrolment hardening for live examination operations.
-- Historical frozen N12 submissions, result imports, centre facts, and approved official
-- results remain untouched and append-only.

create or replace function app_private.has_current_examination_school_role(
  p_school_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with current_membership as (
    select sm.id, sm.school_id, sm.role_key, sm.staff_member_id
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= (now() at time zone 'Africa/Windhoek')::date
      and (sm.active_to is null or sm.active_to >= (now() at time zone 'Africa/Windhoek')::date)
    order by sm.active_from desc, sm.id asc
    limit 1
  )
  select exists (
    select 1
    from current_membership cm
    where cm.school_id = p_school_id
      and cm.role_key = any(p_allowed_roles)
      and (
        cm.staff_member_id is null
        or exists (
          select 1
          from public.staff_school_assignments ssa
          where ssa.staff_member_id = cm.staff_member_id
            and ssa.school_id = cm.school_id
            and ssa.effective_from <= (now() at time zone 'Africa/Windhoek')::date
            and (ssa.effective_to is null or ssa.effective_to >= (now() at time zone 'Africa/Windhoek')::date)
        )
      )
  );
$$;

revoke all on function app_private.has_current_examination_school_role(uuid,text[])
from public,anon,authenticated;
grant execute on function app_private.has_current_examination_school_role(uuid,text[])
to authenticated;

create or replace function app_private.can_manage_examinations(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_current_examination_school_role(
      target_school_id,
      array['school_admin','principal','deputy_principal','exam_officer']
    );
$$;

create or replace function app_private.can_manage_n12_examinations(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_current_examination_school_role(
    p_school_id,
    array['school_admin','principal','deputy_principal','exam_officer']
  );
$$;

revoke all on function app_private.can_manage_n12_examinations(uuid)
from public,anon;
grant execute on function app_private.can_manage_n12_examinations(uuid)
to authenticated;

create or replace function app_private.can_manage_examination_access_n10(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_current_examination_school_role(
    p_school_id,
    array['school_admin','principal','deputy_principal','exam_officer']
  );
$$;

revoke all on function app_private.can_manage_examination_access_n10(uuid)
from public,anon;
grant execute on function app_private.can_manage_examination_access_n10(uuid)
to authenticated;

create or replace function app_private.assert_current_effective_examination_enrolment(
  p_enrolment_id uuid,
  p_school_id uuid,
  p_learner_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_today date := (now() at time zone 'Africa/Windhoek')::date;
begin
  select * into v_enrolment
  from public.enrolments
  where id = p_enrolment_id;

  if not found
     or v_enrolment.school_id is distinct from p_school_id
     or v_enrolment.learner_id is distinct from p_learner_id
     or v_enrolment.status <> 'current'
     or v_enrolment.enrolled_from > v_today
     or (v_enrolment.enrolled_to is not null and v_enrolment.enrolled_to < v_today) then
    raise exception 'Candidate operation requires a current effective enrolment';
  end if;
end;
$$;

revoke all on function app_private.assert_current_effective_examination_enrolment(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function app_private.enforce_live_examination_candidate_enrolment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is not null then
    perform app_private.assert_current_effective_examination_enrolment(
      new.enrolment_id,new.school_id,new.learner_id
    );
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_live_examination_candidate_enrolment()
from public,anon,authenticated;

drop trigger if exists examination_candidate_live_enrolment_trg on public.examination_candidates;
create trigger examination_candidate_live_enrolment_trg
before insert on public.examination_candidates
for each row execute function app_private.enforce_live_examination_candidate_enrolment();

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

  select * into v_candidate
  from public.examination_candidates
  where id=p_candidate_id
  for update;

  if not found then raise exception 'Examination candidate not found'; end if;
  if not app_private.can_manage_examinations(v_candidate.school_id) then
    raise exception 'Permission denied';
  end if;

  perform app_private.assert_current_effective_examination_enrolment(
    v_candidate.enrolment_id,v_candidate.school_id,v_candidate.learner_id
  );

  v_number:=upper(regexp_replace(btrim(coalesce(p_candidate_number,'')),'\s+',' ','g'));
  v_centre:=nullif(upper(regexp_replace(btrim(coalesce(p_centre_number,'')),'\s+',' ','g')),'');
  v_source:=lower(btrim(coalesce(p_source,'')));

  if v_number='' then raise exception 'Candidate Number is required'; end if;
  if v_source not in ('dnea_official','official_import','official_correction') then
    raise exception 'Candidate Number source must be an official authority source';
  end if;

  if exists(
    select 1 from public.examination_candidates ec
    where ec.examination_cycle_id=v_candidate.examination_cycle_id
      and ec.id<>v_candidate.id
      and upper(btrim(ec.candidate_number))=v_number
  ) then
    raise exception 'Candidate Number is already assigned in this examination cycle';
  end if;

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

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_candidate.tenant_id,v_candidate.school_id,auth.uid(),
    'examination.candidate_number.assigned','examination_candidate',v_candidate.id,
    jsonb_build_object(
      'candidate_number',v_number,
      'centre_number',coalesce(v_centre,v_candidate.centre_number),
      'source',v_source
    )
  );

  return true;
end;
$$;

revoke all on function public.assign_examination_candidate_number(uuid,text,text,text,text)
from public,anon;
grant execute on function public.assign_examination_candidate_number(uuid,text,text,text,text)
to authenticated;

comment on function app_private.has_current_examination_school_role(uuid,text[]) is
'Live examination school-role predicate bound to the actor deterministic current school; linked staff memberships additionally require a current effective placement.';
comment on function app_private.assert_current_effective_examination_enrolment(uuid,uuid,uuid) is
'Live candidate-operation guard requiring the canonical enrolment to remain current, effective, and matched to the candidate school and learner.';
