-- Issue #1000: first-class CRC Administration operational workspace.
-- All rows are derived from canonical enrolment, cumulative-record, custody, request and transfer domains.
-- No duplicate CRC completeness or transfer ledger is stored.

create or replace function public.list_crc_administration_learners(p_school_id uuid)
returns table(
  learner_id uuid,
  learner_name text,
  admission_number text,
  grade_id uuid,
  grade_label text,
  register_class_id uuid,
  register_class_label text,
  routine_activity boolean,
  open_request boolean,
  overdue_request boolean,
  missing_incoming boolean,
  temporary_crc boolean,
  outgoing_transfer boolean,
  awaiting_acknowledgement boolean,
  readiness_status text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $crc_admin_learners$
declare
  v_year integer:=extract(year from (now() at time zone 'Africa/Windhoek'))::integer;
  v_today date:=(now() at time zone 'Africa/Windhoek')::date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.is_school_leadership(auth.uid(),p_school_id)
    or app_private.is_support_role_member(auth.uid(),p_school_id)
  ) then raise exception 'Permission denied'; end if;

  select coalesce(max(ay.year),v_year) into v_year
  from public.academic_years ay
  where ay.school_id=p_school_id
    and ay.starts_on<=v_today
    and ay.ends_on>=v_today;

  return query
  with current_enrolments as (
    select
      e.id as enrolment_id,
      e.learner_id,
      e.admission_number,
      e.grade_id,
      e.register_class_id,
      btrim(concat_ws(' ',coalesce(nullif(l.preferred_name,''),l.first_names),l.surname)) as learner_name,
      g.display_name as grade_label,
      rc.display_name as register_class_label
    from public.enrolments e
    join public.learners l on l.id=e.learner_id
    join public.grades g on g.id=e.grade_id
    join public.register_classes rc on rc.id=e.register_class_id
    where e.school_id=p_school_id
      and e.academic_year=v_year
      and e.status='current'
      and e.enrolled_from<=v_today
      and (e.enrolled_to is null or e.enrolled_to>=v_today)
  ),
  routine as (
    select distinct d.learner_id
    from public.learner_development_observations d
    where d.school_id=p_school_id and d.academic_year=v_year
    union
    select distinct n.learner_id
    from public.learner_cumulative_notes n
    join public.enrolments e on e.id=n.enrolment_id
    where n.school_id=p_school_id
      and n.sensitivity='routine'
      and e.academic_year=v_year
  ),
  request_flags as (
    select
      r.learner_id,
      bool_or(r.status in ('requested','escalated','accepted')) as open_request,
      bool_or(
        r.status in ('requested','escalated')
        and r.response_due_on<v_today
      ) as overdue_request,
      bool_or(
        r.status in ('requested','escalated')
        or (
          r.status='accepted'
          and exists(
            select 1
            from public.crc_custody_records c
            where c.id=r.custody_record_id
              and c.custody_status in ('prepared','authorized')
          )
        )
      ) as missing_incoming
    from public.crc_custody_requests r
    where r.receiving_school_id=p_school_id
      and r.status not in ('fulfilled','cancelled')
    group by r.learner_id
  ),
  custody_flags as (
    select
      c.learner_id,
      bool_or(
        c.receiving_school_id=p_school_id
        and c.custody_status in ('dispatched','received')
      ) as temporary_crc,
      bool_or(
        c.school_id=p_school_id
        and c.custody_status not in ('closed')
      ) as outgoing_transfer,
      bool_or(
        c.receiving_school_id=p_school_id
        and c.custody_status in ('dispatched','received')
      ) as awaiting_acknowledgement
    from public.crc_custody_records c
    where c.school_id=p_school_id or c.receiving_school_id=p_school_id
    group by c.learner_id
  )
  select
    ce.learner_id,
    ce.learner_name,
    ce.admission_number,
    ce.grade_id,
    ce.grade_label,
    ce.register_class_id,
    ce.register_class_label,
    (rt.learner_id is not null) as routine_activity,
    coalesce(rf.open_request,false),
    coalesce(rf.overdue_request,false),
    coalesce(rf.missing_incoming,false),
    coalesce(cf.temporary_crc,false),
    coalesce(cf.outgoing_transfer,false),
    coalesce(cf.awaiting_acknowledgement,false),
    case
      when coalesce(rf.missing_incoming,false) then 'missing_incoming'
      when coalesce(cf.temporary_crc,false) then 'temporary'
      when rt.learner_id is not null then 'complete'
      else 'incomplete'
    end as readiness_status
  from current_enrolments ce
  left join routine rt on rt.learner_id=ce.learner_id
  left join request_flags rf on rf.learner_id=ce.learner_id
  left join custody_flags cf on cf.learner_id=ce.learner_id
  order by ce.grade_label,ce.register_class_label,ce.learner_name,ce.learner_id;
end;
$crc_admin_learners$;

revoke all on function public.list_crc_administration_learners(uuid) from public,anon;
grant execute on function public.list_crc_administration_learners(uuid) to authenticated;

comment on function public.list_crc_administration_learners(uuid) is
'Administrative CRC readiness for current learners. Statuses are derived from canonical routine CRC activity, custody requests and custody lifecycle; no confidential support content is returned.';

create or replace function public.list_crc_transfer_register(p_school_id uuid)
returns table(
  register_key text,
  learner_id uuid,
  learner_name text,
  admission_number text,
  direction text,
  counterpart_school_name text,
  transfer_status text,
  custody_status text,
  requested_on date,
  effective_on date,
  dispatched_at timestamptz,
  acknowledged_at timestamptz,
  closed_at timestamptz,
  document_count integer,
  transfer_event_id uuid,
  custody_id uuid
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $crc_transfer_register$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.is_school_leadership(auth.uid(),p_school_id)
    or app_private.is_support_role_member(auth.uid(),p_school_id)
  ) then raise exception 'Permission denied'; end if;

  return query
  with transfer_rows as (
    select
      'transfer:'||te.id::text as register_key,
      te.learner_id,
      btrim(concat_ws(' ',coalesce(nullif(l.preferred_name,''),l.first_names),l.surname)) as learner_name,
      e.admission_number,
      case when te.source_school_id=p_school_id then 'outgoing' else 'incoming' end as direction,
      case
        when te.source_school_id=p_school_id then coalesce(ds.name,te.destination_name,'External school')
        else ss.name
      end as counterpart_school_name,
      te.status as transfer_status,
      c.custody_status,
      te.requested_on,
      te.effective_on,
      c.dispatched_at,
      c.acknowledged_at,
      c.closed_at,
      coalesce(dc.document_count,0)::integer as document_count,
      te.id as transfer_event_id,
      c.id as custody_id
    from public.transfer_events te
    join public.learners l on l.id=te.learner_id
    left join public.enrolments e on e.id=te.source_enrolment_id
    left join public.schools ss on ss.id=te.source_school_id
    left join public.schools ds on ds.id=te.destination_school_id
    left join lateral (
      select cr.*
      from public.crc_custody_records cr
      where cr.learner_id=te.learner_id
        and cr.school_id=te.source_school_id
        and (
          te.destination_school_id is null
          or cr.receiving_school_id=te.destination_school_id
        )
      order by cr.created_at desc,cr.id
      limit 1
    ) c on true
    left join lateral (
      select count(*)::integer as document_count
      from public.crc_custody_documents d
      where d.custody_record_id=c.id
    ) dc on true
    where te.source_school_id=p_school_id
       or te.destination_school_id=p_school_id
  ),
  custody_only as (
    select
      'custody:'||c.id::text,
      c.learner_id,
      btrim(concat_ws(' ',coalesce(nullif(l.preferred_name,''),l.first_names),l.surname)),
      e.admission_number,
      case when c.school_id=p_school_id then 'outgoing' else 'incoming' end,
      case when c.school_id=p_school_id then rs.name else os.name end,
      null::text,
      c.custody_status,
      c.created_at::date,
      null::date,
      c.dispatched_at,
      c.acknowledged_at,
      c.closed_at,
      coalesce(dc.document_count,0)::integer,
      null::uuid,
      c.id
    from public.crc_custody_records c
    join public.learners l on l.id=c.learner_id
    left join public.enrolments e on e.id=c.enrolment_id
    join public.schools os on os.id=c.school_id
    join public.schools rs on rs.id=c.receiving_school_id
    left join lateral (
      select count(*)::integer as document_count
      from public.crc_custody_documents d
      where d.custody_record_id=c.id
    ) dc on true
    where (c.school_id=p_school_id or c.receiving_school_id=p_school_id)
      and not exists(
        select 1
        from public.transfer_events te
        where te.learner_id=c.learner_id
          and te.source_school_id=c.school_id
          and (
            te.destination_school_id is null
            or te.destination_school_id=c.receiving_school_id
          )
      )
  )
  select * from transfer_rows
  union all
  select * from custody_only
  order by requested_on desc nulls last, learner_name, register_key;
end;
$crc_transfer_register$;

revoke all on function public.list_crc_transfer_register(uuid) from public,anon;
grant execute on function public.list_crc_transfer_register(uuid) to authenticated;

comment on function public.list_crc_transfer_register(uuid) is
'Derived CRC transfer register over canonical learner transfer and CRC custody events. No manual duplicate ledger is stored.';

create or replace function public.list_crc_administration_documents(p_school_id uuid)
returns table(
  document_id uuid,
  custody_id uuid,
  learner_id uuid,
  learner_name text,
  admission_number text,
  direction text,
  custody_status text,
  file_name text,
  mime_type text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $crc_admin_documents$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    app_private.is_school_leadership(auth.uid(),p_school_id)
    or app_private.is_support_role_member(auth.uid(),p_school_id)
  ) then raise exception 'Permission denied'; end if;

  return query
  select
    d.id,
    c.id,
    c.learner_id,
    btrim(concat_ws(' ',coalesce(nullif(l.preferred_name,''),l.first_names),l.surname)),
    e.admission_number,
    case when c.school_id=p_school_id then 'outgoing' else 'incoming' end,
    c.custody_status,
    coalesce(d.file_name,'CRC document'),
    d.mime_type,
    d.created_at
  from public.crc_custody_documents d
  join public.crc_custody_records c on c.id=d.custody_record_id
  join public.learners l on l.id=c.learner_id
  left join public.enrolments e on e.id=c.enrolment_id
  where c.school_id=p_school_id or c.receiving_school_id=p_school_id
  order by d.created_at desc,d.id;
end;
$crc_admin_documents$;

revoke all on function public.list_crc_administration_documents(uuid) from public,anon;
grant execute on function public.list_crc_administration_documents(uuid) to authenticated;

comment on function public.list_crc_administration_documents(uuid) is
'Metadata-only CRC custody document register for authorised CRC administrators. Storage paths and confidential document contents are deliberately excluded.';
