-- #1111: complete learner transfer form orchestration and CRC handoff.
-- Transfer event remains the parent record. Confidential CRC contents are never
-- copied into transfer metadata or notifications.

alter table public.transfer_events
  add column if not exists destination_address text,
  add column if not exists crc_handoff_required_at timestamptz,
  add column if not exists crc_handoff_status text not null default 'not_required';

alter table public.transfer_events
  drop constraint if exists transfer_events_crc_handoff_status_check;
alter table public.transfer_events
  add constraint transfer_events_crc_handoff_status_check
  check (crc_handoff_status in (
    'not_required','pending','external_required','prepared','authorized',
    'dispatched','received','acknowledged','closed'
  ));

alter table public.crc_custody_records
  add column if not exists transfer_event_id uuid references public.transfer_events(id) on delete restrict;

create unique index if not exists crc_custody_records_transfer_event_uidx
  on public.crc_custody_records(transfer_event_id)
  where transfer_event_id is not null;

create or replace function public.list_learner_transfer_destination_schools(p_source_school_id uuid)
returns table(
  school_id uuid,
  school_name text,
  emis_number text,
  town text,
  physical_address text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_enrolment_workflow(p_source_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    s.id,
    s.name,
    s.emis_number,
    s.town,
    nullif(btrim(sp.setting_value->>'physical_address'),'')
  from public.schools s
  left join public.school_settings sp
    on sp.school_id=s.id and sp.setting_key='document_profile'
  where s.status='active'
    and s.id<>p_source_school_id
    and s.tenant_id=(select source.tenant_id from public.schools source where source.id=p_source_school_id)
  order by s.name,s.id;
end;
$$;

revoke all on function public.list_learner_transfer_destination_schools(uuid) from public,anon;
grant execute on function public.list_learner_transfer_destination_schools(uuid) to authenticated;

create or replace function app_private.notify_crc_custodians_for_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_transfer public.transfer_events%rowtype;
  v_learner_name text;
  v_destination text;
  v_recipient uuid;
begin
  select * into v_transfer from public.transfer_events where id=p_transfer_id;
  if v_transfer.id is null then return; end if;

  select concat_ws(' ',l.first_names,l.surname)
  into v_learner_name
  from public.learners l
  where l.id=v_transfer.learner_id;

  select coalesce(ds.name,v_transfer.destination_name,'destination school')
  into v_destination
  from (select 1) x
  left join public.schools ds on ds.id=v_transfer.destination_school_id;

  for v_recipient in
    select distinct recipient_id
    from (
      select sm.user_id as recipient_id
      from public.school_memberships sm
      where sm.school_id=v_transfer.source_school_id
        and sm.user_id is not null
        and sm.role_key in ('counsellor','learner_support','social_worker')
        and sm.active_from<=(now() at time zone 'Africa/Windhoek')::date
        and (sm.active_to is null or sm.active_to>=(now() at time zone 'Africa/Windhoek')::date)
      union
      select staff.user_id
      from public.school_duty_assignments d
      join public.staff_members staff on staff.id=d.staff_member_id
      where d.school_id=v_transfer.source_school_id
        and d.duty_key='crc_custodian'
        and d.active_from<=(now() at time zone 'Africa/Windhoek')::date
        and (d.active_to is null or d.active_to>=(now() at time zone 'Africa/Windhoek')::date)
        and staff.user_id is not null
    ) recipients
    where recipient_id is not null
  loop
    begin
      insert into public.notifications(
        recipient_user_id,tenant_id,school_id,severity,title,body,href
      ) values (
        v_recipient,v_transfer.tenant_id,v_transfer.source_school_id,'info',
        'CRC handoff required',
        concat('Prepare the CRC handoff for ',coalesce(v_learner_name,'learner'),' transferring to ',v_destination,'.'),
        '/school/crc-custody'
      );
    exception when others then
      raise warning 'CRC transfer notification side effect failed for recipient %',v_recipient;
    end;
  end loop;
end;
$$;

revoke all on function app_private.notify_crc_custodians_for_transfer(uuid) from public,anon,authenticated;

create or replace function public.approve_learner_transfer(
  p_transfer_id uuid,
  p_effective_on date default null,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_transfer public.transfer_events%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_effective date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_transfer
  from public.transfer_events
  where id=p_transfer_id
  for update;
  if not found then raise exception 'Transfer not found'; end if;
  if not app_private.can_manage_enrolment_workflow(v_transfer.source_school_id) then
    raise exception 'Permission denied';
  end if;
  if v_transfer.status<>'requested' then
    raise exception 'Only requested transfers can be approved';
  end if;
  if v_transfer.destination_school_id=v_transfer.source_school_id then
    raise exception 'Transfer destination must differ from the source school';
  end if;

  select * into v_enrolment
  from public.enrolments
  where id=v_transfer.source_enrolment_id
  for update;
  if not found
     or v_enrolment.learner_id<>v_transfer.learner_id
     or v_enrolment.school_id<>v_transfer.source_school_id then
    raise exception 'Source enrolment does not match transfer';
  end if;
  if v_enrolment.status<>'current' then
    raise exception 'Only a current source enrolment can be transferred';
  end if;

  v_effective:=coalesce(p_effective_on,v_transfer.effective_on,current_date);
  if v_effective<v_transfer.requested_on then
    raise exception 'Transfer effective date cannot precede request date';
  end if;
  if v_effective<v_enrolment.enrolled_from then
    raise exception 'Transfer effective date cannot precede enrolment start';
  end if;

  update public.transfer_events
  set status='approved',
      effective_on=v_effective,
      approved_by_user_id=auth.uid(),
      approved_at=now(),
      decision_note=coalesce(nullif(btrim(coalesce(p_note,'')),''),decision_note),
      crc_handoff_required_at=coalesce(crc_handoff_required_at,now()),
      crc_handoff_status=case
        when destination_school_id is null then 'external_required'
        else 'pending'
      end,
      updated_at=now()
  where id=v_transfer.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_transfer.tenant_id,v_transfer.source_school_id,auth.uid(),
    'learner.transfer.approved','transfer_event',v_transfer.id,
    jsonb_build_object(
      'learner_id',v_transfer.learner_id,
      'source_enrolment_id',v_transfer.source_enrolment_id,
      'effective_on',v_effective,
      'destination_school_id',v_transfer.destination_school_id,
      'destination_name',v_transfer.destination_name,
      'crc_handoff_required',true,
      'note',nullif(btrim(coalesce(p_note,'')),'')
    )
  );

  perform app_private.notify_crc_custodians_for_transfer(v_transfer.id);
  return true;
end;
$$;

revoke all on function public.approve_learner_transfer(uuid,date,text) from public,anon;
grant execute on function public.approve_learner_transfer(uuid,date,text) to authenticated;

create or replace function public.list_crc_transfer_handoff_requirements(p_school_id uuid)
returns table(
  transfer_event_id uuid,
  learner_id uuid,
  learner_name text,
  admission_number text,
  destination_school_id uuid,
  destination_name text,
  effective_on date,
  handoff_status text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.is_crc_custodian(auth.uid(),p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    t.id,
    t.learner_id,
    concat_ws(' ',l.first_names,l.surname),
    e.admission_number,
    t.destination_school_id,
    coalesce(ds.name,t.destination_name,''),
    t.effective_on,
    t.crc_handoff_status
  from public.transfer_events t
  join public.learners l on l.id=t.learner_id
  join public.enrolments e on e.id=t.source_enrolment_id
  left join public.schools ds on ds.id=t.destination_school_id
  where t.source_school_id=p_school_id
    and t.status in ('approved','completed')
    and t.crc_handoff_status in ('pending','external_required')
  order by coalesce(t.effective_on,t.requested_on),l.surname,l.first_names;
end;
$$;

revoke all on function public.list_crc_transfer_handoff_requirements(uuid) from public,anon;
grant execute on function public.list_crc_transfer_handoff_requirements(uuid) to authenticated;

create or replace function public.prepare_crc_custody_for_transfer(
  p_transfer_event_id uuid,
  p_receiving_user_id uuid,
  p_custody_note text default null
)
returns table(custody_id uuid)
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_transfer public.transfer_events%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_custody_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_transfer
  from public.transfer_events
  where id=p_transfer_event_id
  for update;
  if v_transfer.id is null then raise exception 'Transfer not found'; end if;
  if v_transfer.status not in ('approved','completed') then
    raise exception 'CRC handoff is available only for an approved transfer';
  end if;
  if v_transfer.destination_school_id is null then
    raise exception 'External destination requires the manual CRC handoff process';
  end if;
  if not app_private.is_crc_custodian(auth.uid(),v_transfer.source_school_id) then
    raise exception 'Permission denied: not an authorized CRC custodian at the source school';
  end if;
  if not app_private.is_crc_custodian(p_receiving_user_id,v_transfer.destination_school_id) then
    raise exception 'Receiving user is not an authorized CRC custodian at the destination school';
  end if;
  if exists(select 1 from public.crc_custody_records c where c.transfer_event_id=v_transfer.id) then
    raise exception 'CRC custody is already prepared for this learner transfer';
  end if;

  select * into v_enrolment from public.enrolments where id=v_transfer.source_enrolment_id;
  if v_enrolment.id is null then raise exception 'Source enrolment not found'; end if;

  insert into public.crc_custody_records(
    tenant_id,school_id,learner_id,enrolment_id,custody_status,
    prepared_by_user_id,receiving_school_id,receiving_user_id,custody_note,transfer_event_id
  ) values (
    v_transfer.tenant_id,v_transfer.source_school_id,v_transfer.learner_id,v_transfer.source_enrolment_id,
    'prepared',auth.uid(),v_transfer.destination_school_id,p_receiving_user_id,
    nullif(btrim(coalesce(p_custody_note,'')),''),v_transfer.id
  )
  returning id into v_custody_id;

  update public.transfer_events
  set crc_handoff_status='prepared',updated_at=now()
  where id=v_transfer.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_transfer.tenant_id,v_transfer.source_school_id,auth.uid(),
    'crc_custody.prepared_from_transfer','crc_custody_record',v_custody_id,
    jsonb_build_object('transfer_event_id',v_transfer.id,'learner_id',v_transfer.learner_id,'receiving_school_id',v_transfer.destination_school_id)
  );

  return query select v_custody_id;
end;
$$;

revoke all on function public.prepare_crc_custody_for_transfer(uuid,uuid,text) from public,anon;
grant execute on function public.prepare_crc_custody_for_transfer(uuid,uuid,text) to authenticated;

create or replace function public.complete_external_crc_handoff(
  p_transfer_event_id uuid,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_transfer public.transfer_events%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'External CRC handoff note is required'; end if;

  select * into v_transfer
  from public.transfer_events
  where id=p_transfer_event_id
  for update;
  if v_transfer.id is null then raise exception 'Transfer not found'; end if;
  if v_transfer.destination_school_id is not null then raise exception 'Registered destinations use governed CRC custody'; end if;
  if v_transfer.status not in ('approved','completed') then raise exception 'Transfer is not approved'; end if;
  if v_transfer.crc_handoff_status<>'external_required' then raise exception 'External CRC handoff is not awaiting completion'; end if;
  if not app_private.is_crc_custodian(auth.uid(),v_transfer.source_school_id) then raise exception 'Permission denied'; end if;

  update public.transfer_events
  set crc_handoff_status='closed',updated_at=now()
  where id=v_transfer.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_transfer.tenant_id,v_transfer.source_school_id,auth.uid(),
    'crc_custody.external_handoff_completed','transfer_event',v_transfer.id,
    jsonb_build_object('learner_id',v_transfer.learner_id,'destination_name',v_transfer.destination_name,'handoff_note',btrim(p_note))
  );

  return true;
end;
$$;

revoke all on function public.complete_external_crc_handoff(uuid,text) from public,anon;
grant execute on function public.complete_external_crc_handoff(uuid,text) to authenticated;

create or replace function app_private.sync_transfer_crc_handoff_status()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if new.transfer_event_id is not null and new.custody_status is distinct from old.custody_status then
    update public.transfer_events
    set crc_handoff_status=new.custody_status,updated_at=now()
    where id=new.transfer_event_id;
  end if;
  return new;
end;
$$;

revoke all on function app_private.sync_transfer_crc_handoff_status() from public,anon,authenticated;

drop trigger if exists crc_custody_sync_transfer_handoff_trg on public.crc_custody_records;
create trigger crc_custody_sync_transfer_handoff_trg
after update of custody_status on public.crc_custody_records
for each row execute function app_private.sync_transfer_crc_handoff_status();

comment on column public.transfer_events.crc_handoff_status is
'Operational requirement state for CRC handoff initiated by an approved learner transfer. Confidential CRC content remains in governed custody records.';
comment on column public.crc_custody_records.transfer_event_id is
'Optional parent learner transfer event that triggered this governed CRC custody lifecycle.';



-- Refresh transfer-form source snapshot to include destination address.
create or replace function public.get_learner_transfer_form_source(p_transfer_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_transfer public.transfer_events%rowtype;
  v_learner public.learners%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_school public.schools%rowtype;
  v_present_grade text;
  v_last_grade_passed text;
  v_destination text;
  v_destination_address text;
  v_subjects jsonb := '[]'::jsonb;
  v_behaviour_sources jsonb := '[]'::jsonb;
  v_behaviour_suggestion text;
  v_health_sources jsonb := '[]'::jsonb;
  v_health_suggestion text;
  v_other_sources jsonb := '[]'::jsonb;
  v_other_suggestion text;
  v_can_health boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_transfer
  from public.transfer_events t
  where t.id=p_transfer_event_id;

  if v_transfer.id is null then raise exception 'Transfer not found'; end if;
  if not app_private.can_manage_learner_transfer_form(v_transfer.id) then raise exception 'Permission denied'; end if;
  if v_transfer.status not in ('approved','completed') then
    raise exception 'Transfer form is available only after transfer approval';
  end if;

  select * into v_learner from public.learners l where l.id=v_transfer.learner_id;
  select * into v_enrolment from public.enrolments e where e.id=v_transfer.source_enrolment_id;
  select * into v_school from public.schools s where s.id=v_transfer.source_school_id;

  select g.display_name into v_present_grade
  from public.grades g
  where g.id=v_enrolment.grade_id;

  select g.display_name into v_last_grade_passed
  from public.year_end_progressions y
  left join public.grades g on g.id=y.source_grade_id
  where y.learner_id=v_transfer.learner_id
    and y.school_id=v_transfer.source_school_id
    and y.academic_year < v_enrolment.academic_year
    and y.status in ('approved','locked')
    and y.outcome in ('promoted','condoned','completed')
  order by y.academic_year desc,y.decided_at desc nulls last,y.id
  limit 1;

  select
    coalesce(ds.name,v_transfer.destination_name,''),
    coalesce(
      nullif(btrim(sp.setting_value->>'physical_address'),''),
      nullif(btrim(v_transfer.destination_address),''),
      nullif(btrim(ds.town),'')
    )
  into v_destination,v_destination_address
  from (select 1) seed
  left join public.schools ds on ds.id=v_transfer.destination_school_id
  left join public.school_settings sp on sp.school_id=ds.id and sp.setting_key='document_profile';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'registrationId',r.id,
        'subjectId',s.id,
        'subjectCode',s.subject_code,
        'subjectName',s.display_name,
        'status',r.status
      )
      order by s.display_name,s.id
    ),
    '[]'::jsonb
  ) into v_subjects
  from public.learner_subject_registrations r
  join public.subject_offerings so on so.id=r.subject_offering_id
  join public.subjects s on s.id=so.subject_id
  where r.enrolment_id=v_enrolment.id
    and r.learner_id=v_transfer.learner_id;

  with sources as (
    select
      'conduct_event'::text as source_type,
      c.id as source_id,
      c.occurred_on as source_date,
      c.summary as source_text
    from public.conduct_events c
    where c.school_id=v_transfer.source_school_id
      and c.learner_id=v_transfer.learner_id
      and c.status='resolved'
    union all
    select
      'crc_development_observation',
      d.id,
      coalesce(d.observed_on,make_date(d.academic_year,1,1)),
      d.observation
    from public.learner_development_observations d
    where d.school_id=v_transfer.source_school_id
      and d.learner_id=v_transfer.learner_id
      and d.domain in ('social','overall_impression')
  ),
  latest as (
    select * from sources
    order by source_date desc,source_id
    limit 5
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'sourceType',source_type,
      'sourceId',source_id,
      'sourceDate',source_date
    ) order by source_date desc,source_id),'[]'::jsonb),
    nullif(string_agg(btrim(source_text),'; ' order by source_date desc,source_id),'')
  into v_behaviour_sources,v_behaviour_suggestion
  from latest
  where nullif(btrim(coalesce(source_text,'')),'') is not null;

  v_can_health:=app_private.is_support_role_member(auth.uid(),v_transfer.source_school_id);

  if v_can_health then
    with latest_health as (
      select h.id,h.observed_on,h.general_health,h.problem_or_disability,h.management_or_support
      from public.learner_health_history h
      where h.school_id=v_transfer.source_school_id
        and h.learner_id=v_transfer.learner_id
      order by h.observed_on desc,h.id
      limit 1
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'sourceType','crc_health_history',
        'sourceId',id,
        'sourceDate',observed_on
      )),'[]'::jsonb),
      nullif(concat_ws('; ',
        nullif(btrim(coalesce(general_health,'')),''),
        nullif(btrim(coalesce(problem_or_disability,'')),''),
        nullif(btrim(coalesce(management_or_support,'')),'')
      ),'')
    into v_health_sources,v_health_suggestion
    from latest_health
    group by general_health,problem_or_disability,management_or_support;
  end if;

  with latest_notes as (
    select n.id,n.note_date,n.note
    from public.learner_cumulative_notes n
    where n.school_id=v_transfer.source_school_id
      and n.learner_id=v_transfer.learner_id
      and n.sensitivity='routine'
      and n.note_type in ('general_remark','recommendation','transfer_note')
    order by n.note_date desc,n.id
    limit 4
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'sourceType','crc_routine_note',
      'sourceId',id,
      'sourceDate',note_date
    ) order by note_date desc,id),'[]'::jsonb),
    nullif(string_agg(btrim(note),'; ' order by note_date desc,id),'')
  into v_other_sources,v_other_suggestion
  from latest_notes
  where nullif(btrim(coalesce(note,'')),'') is not null;

  return jsonb_build_object(
    'transferEventId',v_transfer.id,
    'transferStatus',v_transfer.status,
    'learnerId',v_learner.id,
    'learnerName',concat_ws(' ',v_learner.first_names,v_learner.surname),
    'dateOfBirth',v_learner.date_of_birth,
    'sourceEnrolmentId',v_enrolment.id,
    'academicYear',v_enrolment.academic_year,
    'presentGrade',coalesce(v_present_grade,''),
    'lastGradePassed',coalesce(v_last_grade_passed,''),
    'subjects',v_subjects,
    'school',jsonb_build_object(
      'schoolId',v_school.id,
      'schoolName',v_school.name,
      'emisNumber',coalesce(v_school.emis_number,''),
      'town',coalesce(v_school.town,'')
    ),
    'newSchool',coalesce(v_destination,''),
    'newSchoolAddress',coalesce(v_destination_address,''),
    'departureDate',v_transfer.effective_on,
    'reasonForDeparture',coalesce(v_transfer.reason,''),
    'suggestions',jsonb_build_object(
      'behaviour',v_behaviour_suggestion,
      'health',case when v_can_health then v_health_suggestion else null end,
      'otherRelevantInformation',v_other_suggestion
    ),
    'suggestionProvenance',jsonb_build_object(
      'behaviour',v_behaviour_sources,
      'health',case when v_can_health then v_health_sources else '[]'::jsonb end,
      'healthAuthorized',v_can_health,
      'otherRelevantInformation',v_other_sources
    )
  );
end;
$$;

revoke all on function public.get_learner_transfer_form_source(uuid) from public,anon;
grant execute on function public.get_learner_transfer_form_source(uuid) to authenticated;



-- Refresh finalization against the enriched source contract.
create or replace function public.finalize_learner_transfer_form(
  p_transfer_event_id uuid,
  p_header_snapshot jsonb
)
returns table(
  snapshot_id uuid,
  revision integer,
  scolapro_reference text,
  verification_token text,
  verification_path text
)
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_transfer public.transfer_events%rowtype;
  v_school public.schools%rowtype;
  v_draft public.learner_transfer_form_drafts%rowtype;
  v_source jsonb;
  v_latest public.learner_transfer_form_snapshots%rowtype;
  v_revision integer;
  v_snapshot_id uuid := gen_random_uuid();
  v_verification record;
  v_finalized_at timestamptz := now();
  v_snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_transfer from public.transfer_events where id=p_transfer_event_id for share;
  if v_transfer.id is null then raise exception 'Transfer not found'; end if;
  if not app_private.can_manage_enrolment_workflow(v_transfer.source_school_id) then
    raise exception 'Only source-school leadership may finalize the learner transfer form';
  end if;
  if v_transfer.status not in ('approved','completed') then
    raise exception 'Transfer form is available only after transfer approval';
  end if;

  select * into v_school from public.schools where id=v_transfer.source_school_id;

  if p_header_snapshot is null or jsonb_typeof(p_header_snapshot)<>'object' then
    raise exception 'Frozen school document header is required';
  end if;
  if nullif(btrim(coalesce(p_header_snapshot->>'schoolName','')),'') is null
     or btrim(p_header_snapshot->>'schoolName')<>btrim(v_school.name) then
    raise exception 'Frozen document header does not match source school';
  end if;

  select * into v_draft
  from public.learner_transfer_form_drafts
  where transfer_event_id=v_transfer.id;

  if v_draft.id is null then raise exception 'Save and verify the transfer form before finalizing'; end if;
  if nullif(btrim(coalesce(v_draft.reason_for_departure,'')),'') is null then
    raise exception 'Reason for departure must be verified before finalization';
  end if;
  if nullif(btrim(coalesce(v_draft.verification_note,'')),'') is null then
    raise exception 'Verification note is required before finalization';
  end if;

  v_source:=public.get_learner_transfer_form_source(v_transfer.id);

  select * into v_latest
  from public.learner_transfer_form_snapshots s
  where s.transfer_event_id=v_transfer.id
  order by s.revision desc
  limit 1;

  v_revision:=coalesce(v_latest.revision,0)+1;

  v_snapshot:=jsonb_build_object(
    'documentType','learner_transfer_form',
    'templateContract','namibia-prescribed-transfer-form',
    'templateContractVersion','7-1/0093-source',
    'source',v_source,
    'header',p_header_snapshot,
    'verifiedFields',jsonb_build_object(
      'reasonForDeparture',v_draft.reason_for_departure,
      'mediumOfInstruction',v_draft.medium_of_instruction,
      'documentsAttached',v_draft.documents_attached,
      'behaviour',v_draft.behaviour_summary,
      'stateOfHealth',v_draft.health_summary,
      'otherRelevantInformation',v_draft.other_relevant_information,
      'verificationNote',v_draft.verification_note
    ),
    'suggestionProvenance',v_source->'suggestionProvenance',
    'finalizedAt',v_finalized_at
  );

  select * into v_verification
  from app_private.register_official_document_verification(
    v_transfer.tenant_id,
    v_transfer.source_school_id,
    'learner_transfer_form',
    v_snapshot_id,
    v_transfer.id,
    v_revision,
    v_latest.official_document_verification_id,
    coalesce(v_transfer.effective_on,v_transfer.requested_on),
    v_finalized_at,
    auth.uid()
  );

  insert into public.learner_transfer_form_snapshots(
    id,tenant_id,school_id,transfer_event_id,revision,source_lineage_id,
    supersedes_snapshot_id,status,data_snapshot,official_document_verification_id,
    finalized_by_user_id,finalized_at
  ) values(
    v_snapshot_id,v_transfer.tenant_id,v_transfer.source_school_id,v_transfer.id,
    v_revision,v_transfer.id,v_latest.id,'finalized',v_snapshot,
    v_verification.verification_id,auth.uid(),v_finalized_at
  );

  if v_latest.id is not null then
    update public.learner_transfer_form_snapshots
    set status='superseded'
    where id=v_latest.id and status='finalized';
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_transfer.tenant_id,v_transfer.source_school_id,auth.uid(),
    'learner_transfer_form.finalized','learner_transfer_form_snapshot',v_snapshot_id,
    jsonb_build_object(
      'transfer_event_id',v_transfer.id,
      'revision',v_revision,
      'scolapro_reference',v_verification.scolapro_reference,
      'supersedes_snapshot_id',v_latest.id
    )
  );

  return query
  select v_snapshot_id,v_revision,v_verification.scolapro_reference,
    v_verification.verification_token,v_verification.verification_path;
end;
$$;

revoke all on function public.finalize_learner_transfer_form(uuid,jsonb) from public,anon;
grant execute on function public.finalize_learner_transfer_form(uuid,jsonb) to authenticated;

