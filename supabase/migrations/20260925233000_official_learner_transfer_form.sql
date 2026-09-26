-- Issue #690: prescribed learner transfer form document workflow.
-- Extends the canonical transfer + CRC domains. The transfer form is a governed
-- document snapshot, not a second transfer lifecycle or learner record.

insert into public.official_document_type_registry(type_key, public_label, reference_code)
values ('learner_transfer_form', 'Learner Transfer Form', 'TRF')
on conflict (type_key) do update set
  public_label=excluded.public_label,
  reference_code=excluded.reference_code,
  active=true;

create table if not exists public.learner_transfer_form_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  transfer_event_id uuid not null unique references public.transfer_events(id) on delete restrict,
  reason_for_departure text,
  medium_of_instruction text,
  documents_attached text,
  behaviour_summary text,
  health_summary text,
  other_relevant_information text,
  verification_note text,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learner_transfer_form_snapshots (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  transfer_event_id uuid not null references public.transfer_events(id) on delete restrict,
  revision integer not null check(revision > 0),
  source_lineage_id uuid not null,
  supersedes_snapshot_id uuid references public.learner_transfer_form_snapshots(id) on delete restrict,
  status text not null default 'finalized' check(status in ('finalized','superseded','revoked')),
  data_snapshot jsonb not null check(jsonb_typeof(data_snapshot)='object'),
  official_document_verification_id uuid not null references public.official_document_verifications(id) on delete restrict,
  finalized_by_user_id uuid not null references auth.users(id) on delete restrict,
  finalized_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(transfer_event_id,revision),
  unique(source_lineage_id,revision)
);

create index if not exists learner_transfer_form_snapshots_transfer_idx
on public.learner_transfer_form_snapshots(transfer_event_id,revision desc);

alter table public.learner_transfer_form_drafts enable row level security;
alter table public.learner_transfer_form_snapshots enable row level security;

create or replace function app_private.can_manage_learner_transfer_form(p_transfer_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1
    from public.transfer_events t
    where t.id=p_transfer_event_id
      and (
        app_private.can_manage_enrolment_workflow(t.source_school_id)
        or app_private.is_crc_custodian(auth.uid(),t.source_school_id)
      )
  );
$$;

revoke all on function app_private.can_manage_learner_transfer_form(uuid)
from public,anon,authenticated;

create or replace function app_private.can_read_learner_transfer_form_for_rls(p_transfer_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select app_private.can_manage_learner_transfer_form(p_transfer_event_id);
$$;

revoke all on function app_private.can_read_learner_transfer_form_for_rls(uuid)
from public,anon;
grant execute on function app_private.can_read_learner_transfer_form_for_rls(uuid)
to authenticated;

create policy "authorized source actors read transfer form drafts"
on public.learner_transfer_form_drafts for select to authenticated
using(app_private.can_read_learner_transfer_form_for_rls(transfer_event_id));

create policy "authorized source actors read transfer form snapshots"
on public.learner_transfer_form_snapshots for select to authenticated
using(app_private.can_read_learner_transfer_form_for_rls(transfer_event_id));

revoke insert,update,delete on public.learner_transfer_form_drafts from authenticated;
revoke insert,update,delete on public.learner_transfer_form_snapshots from authenticated;
grant select on public.learner_transfer_form_drafts,public.learner_transfer_form_snapshots to authenticated;

create or replace function app_private.guard_learner_transfer_form_snapshot_immutability()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if tg_op='DELETE' then
    raise exception 'Finalized learner transfer forms cannot be deleted';
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.transfer_event_id is distinct from old.transfer_event_id
     or new.revision is distinct from old.revision
     or new.source_lineage_id is distinct from old.source_lineage_id
     or new.supersedes_snapshot_id is distinct from old.supersedes_snapshot_id
     or new.data_snapshot is distinct from old.data_snapshot
     or new.official_document_verification_id is distinct from old.official_document_verification_id
     or new.finalized_by_user_id is distinct from old.finalized_by_user_id
     or new.finalized_at is distinct from old.finalized_at
     or new.created_at is distinct from old.created_at then
    raise exception 'Finalized learner transfer form content is immutable';
  end if;

  if not (old.status='finalized' and new.status='superseded') then
    raise exception 'Invalid learner transfer form snapshot transition';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_learner_transfer_form_snapshot_immutability()
from public,anon,authenticated;

drop trigger if exists learner_transfer_form_snapshot_immutability_trg
on public.learner_transfer_form_snapshots;
create trigger learner_transfer_form_snapshot_immutability_trg
before update or delete on public.learner_transfer_form_snapshots
for each row execute function app_private.guard_learner_transfer_form_snapshot_immutability();

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

  select coalesce(ds.name,v_transfer.destination_name,'') into v_destination
  from (select 1) seed
  left join public.schools ds on ds.id=v_transfer.destination_school_id;

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
      and n.note_type in ('general_remark','educational','transfer')
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

create or replace function public.save_learner_transfer_form_draft(
  p_transfer_event_id uuid,
  p_reason_for_departure text,
  p_documents_attached text,
  p_behaviour_summary text,
  p_health_summary text,
  p_other_relevant_information text,
  p_verification_note text,
  p_medium_of_instruction text
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_transfer public.transfer_events%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_transfer from public.transfer_events where id=p_transfer_event_id;
  if v_transfer.id is null then raise exception 'Transfer not found'; end if;
  if not app_private.can_manage_learner_transfer_form(v_transfer.id) then raise exception 'Permission denied'; end if;
  if v_transfer.status not in ('approved','completed') then raise exception 'Transfer form is available only after transfer approval'; end if;

  insert into public.learner_transfer_form_drafts(
    tenant_id,school_id,transfer_event_id,reason_for_departure,medium_of_instruction,documents_attached,
    behaviour_summary,health_summary,other_relevant_information,verification_note,
    updated_by_user_id,updated_at
  ) values(
    v_transfer.tenant_id,v_transfer.source_school_id,v_transfer.id,
    nullif(btrim(coalesce(p_reason_for_departure,'')),''),
    nullif(btrim(coalesce(p_medium_of_instruction,'')),''),
    nullif(btrim(coalesce(p_documents_attached,'')),'') ,
    nullif(btrim(coalesce(p_behaviour_summary,'')),''),
    nullif(btrim(coalesce(p_health_summary,'')),''),
    nullif(btrim(coalesce(p_other_relevant_information,'')),''),
    nullif(btrim(coalesce(p_verification_note,'')),''),
    auth.uid(),now()
  )
  on conflict(transfer_event_id) do update set
    reason_for_departure=excluded.reason_for_departure,
    medium_of_instruction=excluded.medium_of_instruction,
    documents_attached=excluded.documents_attached,
    behaviour_summary=excluded.behaviour_summary,
    health_summary=excluded.health_summary,
    other_relevant_information=excluded.other_relevant_information,
    verification_note=excluded.verification_note,
    updated_by_user_id=auth.uid(),
    updated_at=now()
  returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_transfer.tenant_id,v_transfer.source_school_id,auth.uid(),
    'learner_transfer_form.draft_saved','learner_transfer_form_draft',v_id,
    jsonb_build_object('transfer_event_id',v_transfer.id)
  );

  return v_id;
end;
$$;

revoke all on function public.save_learner_transfer_form_draft(uuid,text,text,text,text,text,text,text)
from public,anon;
grant execute on function public.save_learner_transfer_form_draft(uuid,text,text,text,text,text,text,text)
to authenticated;

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

create or replace function public.get_learner_transfer_form_finalization(p_transfer_event_id uuid)
returns table(
  snapshot_id uuid,
  revision integer,
  status text,
  scolapro_reference text,
  verification_token text,
  verification_path text,
  finalized_at timestamptz,
  data_snapshot jsonb
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_learner_transfer_form(p_transfer_event_id) then raise exception 'Permission denied'; end if;

  return query
  select s.id,s.revision,s.status,v.scolapro_reference,v.verification_token,
    '/verify/'||v.verification_token,s.finalized_at,s.data_snapshot
  from public.learner_transfer_form_snapshots s
  join public.official_document_verifications v on v.id=s.official_document_verification_id
  where s.transfer_event_id=p_transfer_event_id
  order by s.revision desc
  limit 1;
end;
$$;

revoke all on function public.get_learner_transfer_form_finalization(uuid) from public,anon;
grant execute on function public.get_learner_transfer_form_finalization(uuid) to authenticated;

comment on table public.learner_transfer_form_drafts is
'Human verification workspace for the prescribed learner transfer form. Authoritative learner/transfer fields remain derived from canonical sources.';
comment on table public.learner_transfer_form_snapshots is
'Immutable finalized learner transfer-form revisions linked to canonical transfer events and shared official-document verification provenance.';


create or replace function public.list_learner_transfer_form_candidates()
returns table(
  transfer_event_id uuid,
  learner_name text,
  admission_number text,
  transfer_status text,
  destination_name text,
  effective_on date,
  requested_on date,
  latest_revision integer,
  latest_finalized_at timestamptz
)
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select
    t.id,
    concat_ws(' ',l.first_names,l.surname),
    e.admission_number,
    t.status,
    coalesce(ds.name,t.destination_name,''),
    t.effective_on,
    t.requested_on,
    latest.revision,
    latest.finalized_at
  from public.transfer_events t
  join public.learners l on l.id=t.learner_id
  join public.enrolments e on e.id=t.source_enrolment_id
  left join public.schools ds on ds.id=t.destination_school_id
  left join lateral(
    select s.revision,s.finalized_at
    from public.learner_transfer_form_snapshots s
    where s.transfer_event_id=t.id
    order by s.revision desc
    limit 1
  ) latest on true
  where auth.uid() is not null
    and t.status in ('approved','completed')
    and app_private.can_manage_learner_transfer_form(t.id)
  order by coalesce(t.effective_on,t.requested_on) desc,t.id;
$$;

revoke all on function public.list_learner_transfer_form_candidates() from public,anon;
grant execute on function public.list_learner_transfer_form_candidates() to authenticated;


create or replace function public.get_learner_transfer_form_snapshot_for_render(p_snapshot_id uuid)
returns table(
  snapshot_id uuid,
  transfer_event_id uuid,
  revision integer,
  status text,
  data_snapshot jsonb,
  finalized_at timestamptz,
  scolapro_reference text,
  verification_token text,
  verification_path text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_transfer_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select s.transfer_event_id into v_transfer_event_id
  from public.learner_transfer_form_snapshots s
  where s.id=p_snapshot_id;

  if v_transfer_event_id is null then raise exception 'Learner transfer-form snapshot not found'; end if;
  if not app_private.can_manage_learner_transfer_form(v_transfer_event_id) then raise exception 'Permission denied'; end if;

  return query
  select
    s.id,
    s.transfer_event_id,
    s.revision,
    s.status,
    s.data_snapshot,
    s.finalized_at,
    v.scolapro_reference,
    v.verification_token,
    '/verify/'||v.verification_token
  from public.learner_transfer_form_snapshots s
  join public.official_document_verifications v
    on v.id=s.official_document_verification_id
  where s.id=p_snapshot_id;
end;
$$;

revoke all on function public.get_learner_transfer_form_snapshot_for_render(uuid) from public,anon;
grant execute on function public.get_learner_transfer_form_snapshot_for_render(uuid) to authenticated;

comment on function public.get_learner_transfer_form_snapshot_for_render(uuid) is
'Authorized immutable learner transfer-form snapshot plus shared verification provenance for HTML/PDF rendering.';
