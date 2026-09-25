-- Issue #688: CRC contributor and custodian administration workspace.
-- Reuses the canonical cumulative-record, enrolment, register-class and custody
-- domains. Routine class-teacher contributions are append-only and cannot write
-- health, psychometric, counselling or highly restricted records.

create or replace function app_private.is_current_register_teacher_for_enrolment(
  p_enrolment_id uuid,
  p_on_date date default (now() at time zone 'Africa/Windhoek')::date
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select p_enrolment_id is not null
    and p_on_date is not null
    and exists(
      select 1
      from public.enrolments e
      join public.register_classes rc on rc.id=e.register_class_id
      join public.staff_members sm on sm.id=rc.register_teacher_staff_id
      where e.id=p_enrolment_id
        and e.status='current'
        and e.enrolled_from<=p_on_date
        and (e.enrolled_to is null or e.enrolled_to>=p_on_date)
        and rc.school_id=e.school_id
        and rc.academic_year=e.academic_year
        and sm.user_id=auth.uid()
        and sm.status='active'
        and app_private.staff_member_has_school_assignment(sm.id,e.school_id,p_on_date)
    );
$$;

revoke all on function app_private.is_current_register_teacher_for_enrolment(uuid,date)
from public,anon,authenticated;

create or replace function public.get_my_crc_contribution_context(
  p_learner_id uuid,
  p_school_id uuid
)
returns table(
  enrolment_id uuid,
  learner_id uuid,
  school_id uuid,
  academic_year integer,
  grade_label text,
  register_class_label text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  return query
  select
    e.id,
    e.learner_id,
    e.school_id,
    e.academic_year,
    g.display_name,
    rc.display_name
  from public.enrolments e
  join public.grades g on g.id=e.grade_id
  join public.register_classes rc on rc.id=e.register_class_id
  where e.learner_id=p_learner_id
    and e.school_id=p_school_id
    and e.status='current'
    and e.enrolled_from<=(now() at time zone 'Africa/Windhoek')::date
    and (e.enrolled_to is null or e.enrolled_to>=(now() at time zone 'Africa/Windhoek')::date)
    and app_private.is_current_register_teacher_for_enrolment(e.id)
  order by e.enrolled_from desc,e.id
  limit 1;
end;
$$;

revoke all on function public.get_my_crc_contribution_context(uuid,uuid) from public,anon;
grant execute on function public.get_my_crc_contribution_context(uuid,uuid) to authenticated;

create or replace function public.append_crc_routine_contribution(
  p_enrolment_id uuid,
  p_domain text,
  p_observation text,
  p_general_remark text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_grade_label text;
  v_observation_id uuid;
  v_remark text := nullif(btrim(coalesce(p_general_remark,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_domain not in ('psychological','social','overall_impression') then
    raise exception 'Unsupported routine CRC observation domain';
  end if;
  if nullif(btrim(coalesce(p_observation,'')),'') is null then
    raise exception 'Routine CRC observation is required';
  end if;

  select e.* into v_enrolment
  from public.enrolments e
  where e.id=p_enrolment_id;

  if v_enrolment.id is null then raise exception 'Current learner enrolment not found'; end if;
  if not app_private.is_current_register_teacher_for_enrolment(v_enrolment.id) then
    raise exception 'Permission denied: current register-teacher authority required';
  end if;

  select g.display_name into v_grade_label
  from public.grades g
  where g.id=v_enrolment.grade_id;

  insert into public.learner_development_observations(
    tenant_id,school_id,learner_id,enrolment_id,academic_year,grade_label,
    domain,observation,observed_on,recorded_by_user_id
  )
  values(
    v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.learner_id,v_enrolment.id,
    v_enrolment.academic_year,v_grade_label,p_domain,btrim(p_observation),
    (now() at time zone 'Africa/Windhoek')::date,auth.uid()
  )
  returning id into v_observation_id;

  if v_remark is not null then
    insert into public.learner_cumulative_notes(
      tenant_id,school_id,learner_id,enrolment_id,note_date,note_type,note,
      sensitivity,recorded_by_user_id
    )
    values(
      v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.learner_id,v_enrolment.id,
      (now() at time zone 'Africa/Windhoek')::date,'general_remark',v_remark,
      'routine',auth.uid()
    );
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  )
  values(
    v_enrolment.tenant_id,v_enrolment.school_id,auth.uid(),
    'crc.routine_contribution_recorded','learner_development_observation',v_observation_id,
    jsonb_build_object(
      'learner_id',v_enrolment.learner_id,
      'enrolment_id',v_enrolment.id,
      'academic_year',v_enrolment.academic_year,
      'domain',p_domain,
      'routine_general_remark_added',v_remark is not null
    )
  );

  return v_observation_id;
end;
$$;

revoke all on function public.append_crc_routine_contribution(uuid,text,text,text) from public,anon;
grant execute on function public.append_crc_routine_contribution(uuid,text,text,text) to authenticated;

create or replace function public.get_crc_administration_summary(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_leadership boolean;
  v_support boolean;
  v_year integer := extract(year from (now() at time zone 'Africa/Windhoek'))::integer;
  v_total integer;
  v_contributed integer;
  v_outgoing integer;
  v_incoming integer;
  v_requests integer;
  v_awaiting_ack integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_leadership := app_private.is_school_leadership(auth.uid(),p_school_id);
  v_support := app_private.is_support_role_member(auth.uid(),p_school_id);
  if not (v_leadership or v_support) then raise exception 'Permission denied'; end if;

  select coalesce(max(ay.year),v_year)
    into v_year
  from public.academic_years ay
  where ay.school_id=p_school_id
    and ay.starts_on<=(now() at time zone 'Africa/Windhoek')::date
    and ay.ends_on>=(now() at time zone 'Africa/Windhoek')::date;

  select count(*)::integer into v_total
  from public.enrolments e
  where e.school_id=p_school_id
    and e.academic_year=v_year
    and e.status='current'
    and e.enrolled_from<=(now() at time zone 'Africa/Windhoek')::date
    and (e.enrolled_to is null or e.enrolled_to>=(now() at time zone 'Africa/Windhoek')::date);

  select count(distinct x.learner_id)::integer into v_contributed
  from (
    select d.learner_id
    from public.learner_development_observations d
    where d.school_id=p_school_id and d.academic_year=v_year
    union
    select n.learner_id
    from public.learner_cumulative_notes n
    join public.enrolments e on e.id=n.enrolment_id
    where n.school_id=p_school_id and n.sensitivity='routine' and e.academic_year=v_year
  ) x;

  select
    count(*) filter(where r.school_id=p_school_id)::integer,
    count(*) filter(where r.receiving_school_id=p_school_id)::integer,
    count(*) filter(where r.school_id=p_school_id and r.custody_status in ('prepared','authorized'))::integer,
    count(*) filter(where r.receiving_school_id=p_school_id and r.custody_status in ('dispatched','received'))::integer
  into v_outgoing,v_incoming,v_requests,v_awaiting_ack
  from public.crc_custody_records r
  where (r.school_id=p_school_id or r.receiving_school_id=p_school_id)
    and app_private.can_access_crc_custody_record(r.id);

  return jsonb_build_object(
    'academic_year',v_year,
    'current_learners',coalesce(v_total,0),
    'learners_with_routine_crc_activity',coalesce(v_contributed,0),
    'learners_without_routine_crc_activity',greatest(coalesce(v_total,0)-coalesce(v_contributed,0),0),
    'outgoing_transfers',coalesce(v_outgoing,0),
    'incoming_transfers',coalesce(v_incoming,0),
    'requests_awaiting_action',coalesce(v_requests,0),
    'incoming_awaiting_acknowledgement',coalesce(v_awaiting_ack,0),
    'can_view_confidential_support',v_support,
    'leadership_oversight',v_leadership
  );
end;
$$;

revoke all on function public.get_crc_administration_summary(uuid) from public,anon;
grant execute on function public.get_crc_administration_summary(uuid) to authenticated;

create or replace function public.list_crc_class_completeness(p_school_id uuid)
returns table(
  register_class_id uuid,
  register_class_label text,
  grade_label text,
  learner_count integer,
  contributed_count integer,
  follow_up_count integer
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Africa/Windhoek'))::integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.is_school_leadership(auth.uid(),p_school_id)
    or app_private.is_support_role_member(auth.uid(),p_school_id)
  ) then raise exception 'Permission denied'; end if;

  select coalesce(max(ay.year),v_year) into v_year
  from public.academic_years ay
  where ay.school_id=p_school_id
    and ay.starts_on<=(now() at time zone 'Africa/Windhoek')::date
    and ay.ends_on>=(now() at time zone 'Africa/Windhoek')::date;

  return query
  with current_enrolments as (
    select e.id,e.learner_id,e.register_class_id
    from public.enrolments e
    where e.school_id=p_school_id
      and e.academic_year=v_year
      and e.status='current'
      and e.enrolled_from<=(now() at time zone 'Africa/Windhoek')::date
      and (e.enrolled_to is null or e.enrolled_to>=(now() at time zone 'Africa/Windhoek')::date)
  ),
  contributed as (
    select distinct d.learner_id
    from public.learner_development_observations d
    where d.school_id=p_school_id and d.academic_year=v_year
    union
    select distinct n.learner_id
    from public.learner_cumulative_notes n
    join public.enrolments e on e.id=n.enrolment_id
    where n.school_id=p_school_id and n.sensitivity='routine' and e.academic_year=v_year
  )
  select
    rc.id,
    rc.display_name,
    g.display_name,
    count(ce.id)::integer,
    count(ce.id) filter(where c.learner_id is not null)::integer,
    count(ce.id) filter(where c.learner_id is null)::integer
  from public.register_classes rc
  join public.grades g on g.id=rc.grade_id
  left join current_enrolments ce on ce.register_class_id=rc.id
  left join contributed c on c.learner_id=ce.learner_id
  where rc.school_id=p_school_id and rc.academic_year=v_year
  group by rc.id,rc.display_name,g.display_name
  order by g.display_name,rc.display_name,rc.id;
end;
$$;

revoke all on function public.list_crc_class_completeness(uuid) from public,anon;
grant execute on function public.list_crc_class_completeness(uuid) to authenticated;

comment on function public.append_crc_routine_contribution(uuid,text,text,text) is
'Append-only routine CRC contribution for the current register teacher. Writes only development observations and optional routine general remarks; never health, psychometric or counselling data.';
comment on function public.get_crc_administration_summary(uuid) is
'Administrative CRC readiness and custody counts only. Leadership receives no confidential support content; explicit support-role users retain their separate need-to-know access.';
