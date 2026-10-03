-- Issue #998: shared staged document intake foundation + admissions workflow.
-- Extraction/OCR is source staging only. It never writes learner, guardian or enrolment
-- domain tables directly. Authoritative admission/enrolment remains behind existing
-- governed admission decision and enrolment boundaries.

create table if not exists public.document_intake_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  intake_type text not null check (intake_type in ('admission','transfer','calendar','timetable','crc','generic')),
  document_type text not null check (btrim(document_type)<>''),
  source_kind text not null check (source_kind in ('upload','scan','online_form','structured_import')),
  status text not null default 'staged' check (status in ('staged','review','ready','committed','failed','cancelled')),
  extraction_status text not null default 'pending' check (extraction_status in ('pending','extracted','failed','not_required')),
  candidate_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(candidate_payload)='object'),
  field_confidence jsonb not null default '{}'::jsonb check (jsonb_typeof(field_confidence)='object'),
  match_status text not null default 'pending' check (match_status in ('pending','no_match','possible_match','reviewed')),
  match_candidates jsonb not null default '{"learners":[],"guardians":[]}'::jsonb check (jsonb_typeof(match_candidates)='object'),
  selected_learner_id uuid references public.learners(id) on delete restrict,
  review_decision text not null default 'pending' check (review_decision in ('pending','create_new','use_existing_learner','rejected')),
  committed_entity_type text,
  committed_entity_id uuid,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  committed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  committed_at timestamptz,
  check (
    (status='committed' and committed_entity_type is not null and committed_entity_id is not null and committed_at is not null)
    or status<>'committed'
  )
);

create index if not exists document_intake_jobs_school_year_status_idx
on public.document_intake_jobs(school_id,academic_year,status,created_at desc);

create table if not exists public.document_intake_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.document_intake_jobs(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  artifact_kind text not null check (artifact_kind in (
    'application_form','photo_passport','birth_certificate','identity_document',
    'report_card','transfer_support','supporting_document','other'
  )),
  storage_path text not null check (btrim(storage_path)<>''),
  file_name text not null check (btrim(file_name)<>''),
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes>0 and file_size_bytes<=10485760),
  sha256 text,
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(job_id,storage_path)
);

create index if not exists document_intake_artifacts_job_idx
on public.document_intake_artifacts(job_id,created_at);

alter table public.admission_applications
  add column if not exists intake_job_id uuid references public.document_intake_jobs(id) on delete restrict,
  add column if not exists source_provenance jsonb not null default '{}'::jsonb;

create unique index if not exists admission_applications_intake_job_uidx
on public.admission_applications(intake_job_id)
where intake_job_id is not null;

alter table public.document_intake_jobs enable row level security;
alter table public.document_intake_artifacts enable row level security;

create or replace function app_private.can_manage_document_intake(
  p_school_id uuid,
  p_intake_type text
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select case
    when p_intake_type='admission'
      then app_private.can_manage_enrolment_workflow(p_school_id)
    else false
  end;
$$;

revoke all on function app_private.can_manage_document_intake(uuid,text)
from public,anon,authenticated;
grant execute on function app_private.can_manage_document_intake(uuid,text) to authenticated;

drop policy if exists "authorized managers read document intake jobs" on public.document_intake_jobs;
create policy "authorized managers read document intake jobs"
on public.document_intake_jobs for select to authenticated
using (app_private.can_manage_document_intake(school_id,intake_type));

drop policy if exists "authorized managers manage document intake jobs" on public.document_intake_jobs;
create policy "authorized managers manage document intake jobs"
on public.document_intake_jobs for all to authenticated
using (app_private.can_manage_document_intake(school_id,intake_type))
with check (app_private.can_manage_document_intake(school_id,intake_type));

drop policy if exists "authorized managers read document intake artifacts" on public.document_intake_artifacts;
create policy "authorized managers read document intake artifacts"
on public.document_intake_artifacts for select to authenticated
using (
  exists(
    select 1 from public.document_intake_jobs j
    where j.id=job_id
      and j.school_id=document_intake_artifacts.school_id
      and j.tenant_id=document_intake_artifacts.tenant_id
      and app_private.can_manage_document_intake(j.school_id,j.intake_type)
  )
);

drop policy if exists "authorized managers manage document intake artifacts" on public.document_intake_artifacts;
create policy "authorized managers manage document intake artifacts"
on public.document_intake_artifacts for all to authenticated
using (
  exists(
    select 1 from public.document_intake_jobs j
    where j.id=job_id
      and j.school_id=document_intake_artifacts.school_id
      and j.tenant_id=document_intake_artifacts.tenant_id
      and app_private.can_manage_document_intake(j.school_id,j.intake_type)
      and j.status not in ('committed','cancelled')
  )
)
with check (
  exists(
    select 1 from public.document_intake_jobs j
    where j.id=job_id
      and j.school_id=document_intake_artifacts.school_id
      and j.tenant_id=document_intake_artifacts.tenant_id
      and app_private.can_manage_document_intake(j.school_id,j.intake_type)
      and j.status not in ('committed','cancelled')
  )
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'document-intake-private',
  'document-intake-private',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create or replace function app_private.can_access_document_intake_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,storage,app_private
as $$
  select case
    when array_length(storage.foldername(p_name),1)<2 then false
    else exists(
      select 1
      from public.document_intake_jobs j
      where j.school_id::text=(storage.foldername(p_name))[1]
        and j.id::text=(storage.foldername(p_name))[2]
        and app_private.can_manage_document_intake(j.school_id,j.intake_type)
    )
  end;
$$;

revoke all on function app_private.can_access_document_intake_object(text)
from public,anon,authenticated;

create or replace function app_private.can_access_document_intake_object_policy(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,storage,app_private
as $$
  select app_private.can_access_document_intake_object(p_name);
$$;

revoke all on function app_private.can_access_document_intake_object_policy(text)
from public,anon;
grant execute on function app_private.can_access_document_intake_object_policy(text)
to authenticated;

drop policy if exists "authorized managers upload document intake artifacts" on storage.objects;
create policy "authorized managers upload document intake artifacts"
on storage.objects for insert to authenticated
with check (
  bucket_id='document-intake-private'
  and app_private.can_access_document_intake_object_policy(name)
  and exists(
    select 1
    from public.document_intake_jobs j
    where j.school_id::text=(storage.foldername(name))[1]
      and j.id::text=(storage.foldername(name))[2]
      and j.status not in ('committed','cancelled')
  )
);

drop policy if exists "authorized managers read document intake artifacts" on storage.objects;
create policy "authorized managers read document intake artifacts"
on storage.objects for select to authenticated
using (
  bucket_id='document-intake-private'
  and app_private.can_access_document_intake_object_policy(name)
);

drop policy if exists "authorized managers delete staged document intake artifacts" on storage.objects;
create policy "authorized managers delete staged document intake artifacts"
on storage.objects for delete to authenticated
using (
  bucket_id='document-intake-private'
  and app_private.can_access_document_intake_object_policy(name)
  and exists(
    select 1
    from public.document_intake_jobs j
    where j.school_id::text=(storage.foldername(name))[1]
      and j.id::text=(storage.foldername(name))[2]
      and j.status not in ('committed','cancelled')
  )
);

create or replace function public.create_admission_intake_job(
  p_school_id uuid,
  p_academic_year integer,
  p_source_kind text default 'scan',
  p_document_type text default 'application_form'
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_tenant_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_source_kind not in ('upload','scan','online_form') then raise exception 'Unsupported admission intake source'; end if;
  if btrim(coalesce(p_document_type,''))='' then raise exception 'Document type is required'; end if;
  if not app_private.can_manage_enrolment_workflow(p_school_id) then raise exception 'Permission denied'; end if;

  select tenant_id into v_tenant_id from public.schools where id=p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;

  insert into public.document_intake_jobs(
    tenant_id,school_id,academic_year,intake_type,document_type,source_kind,
    extraction_status,created_by_user_id
  ) values(
    v_tenant_id,p_school_id,p_academic_year,'admission',btrim(p_document_type),p_source_kind,
    case when p_source_kind='online_form' then 'not_required' else 'pending' end,
    auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_tenant_id,p_school_id,auth.uid(),
    'document_intake.created','document_intake_job',v_id,
    jsonb_build_object('intake_type','admission','source_kind',p_source_kind,'document_type',btrim(p_document_type))
  );

  return v_id;
end;
$$;

revoke all on function public.create_admission_intake_job(uuid,integer,text,text)
from public,anon;
grant execute on function public.create_admission_intake_job(uuid,integer,text,text)
to authenticated;

create or replace function public.register_document_intake_artifact(
  p_job_id uuid,
  p_artifact_kind text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256 text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,storage,app_private
as $$
declare
  v_job public.document_intake_jobs%rowtype;
  v_id uuid;
  v_prefix text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_job from public.document_intake_jobs where id=p_job_id for update;
  if not found then raise exception 'Document intake job not found'; end if;
  if not app_private.can_manage_document_intake(v_job.school_id,v_job.intake_type) then raise exception 'Permission denied'; end if;
  if v_job.status in ('committed','cancelled') then raise exception 'Document intake job is no longer editable'; end if;
  if p_artifact_kind not in (
    'application_form','photo_passport','birth_certificate','identity_document',
    'report_card','transfer_support','supporting_document','other'
  ) then raise exception 'Unsupported artifact kind'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp') then raise exception 'Unsupported artifact type'; end if;
  if p_file_size_bytes<=0 or p_file_size_bytes>10485760 then raise exception 'Artifact must be 10 MB or smaller'; end if;

  v_prefix:=v_job.school_id::text||'/'||v_job.id::text||'/';
  if left(btrim(coalesce(p_storage_path,'')),length(v_prefix))<>v_prefix then
    raise exception 'Artifact storage path does not match this intake job';
  end if;
  if not exists(
    select 1 from storage.objects o
    where o.bucket_id='document-intake-private' and o.name=btrim(p_storage_path)
  ) then
    raise exception 'Uploaded intake artifact was not found';
  end if;

  insert into public.document_intake_artifacts(
    job_id,tenant_id,school_id,artifact_kind,storage_path,file_name,mime_type,
    file_size_bytes,sha256,uploaded_by_user_id
  ) values(
    v_job.id,v_job.tenant_id,v_job.school_id,p_artifact_kind,btrim(p_storage_path),
    btrim(p_file_name),p_mime_type,p_file_size_bytes,nullif(btrim(coalesce(p_sha256,'')),''),
    auth.uid()
  ) returning id into v_id;

  update public.document_intake_jobs set updated_at=now() where id=v_job.id;
  return v_id;
end;
$$;

revoke all on function public.register_document_intake_artifact(uuid,text,text,text,text,bigint,text)
from public,anon;
grant execute on function public.register_document_intake_artifact(uuid,text,text,text,text,bigint,text)
to authenticated;

create or replace function public.save_admission_intake_candidate(
  p_job_id uuid,
  p_candidate_payload jsonb,
  p_field_confidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_job public.document_intake_jobs%rowtype;
  v_first text;
  v_surname text;
  v_dob date;
  v_contact_1 text;
  v_contact_2 text;
  v_learners jsonb:='[]'::jsonb;
  v_guardians jsonb:='[]'::jsonb;
  v_match_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_candidate_payload,'{}'::jsonb))<>'object' then raise exception 'Candidate payload must be an object'; end if;
  if jsonb_typeof(coalesce(p_field_confidence,'{}'::jsonb))<>'object' then raise exception 'Field confidence must be an object'; end if;

  select * into v_job from public.document_intake_jobs where id=p_job_id for update;
  if not found or v_job.intake_type<>'admission' then raise exception 'Admission intake job not found'; end if;
  if not app_private.can_manage_enrolment_workflow(v_job.school_id) then raise exception 'Permission denied'; end if;
  if v_job.status in ('committed','cancelled') then raise exception 'Document intake job is no longer editable'; end if;

  v_first:=nullif(btrim(p_candidate_payload->>'first_names'),'');
  v_surname:=nullif(btrim(p_candidate_payload->>'surname'),'');
  if coalesce(p_candidate_payload->>'date_of_birth','') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_dob:=(p_candidate_payload->>'date_of_birth')::date;
  end if;
  v_contact_1:=nullif(regexp_replace(coalesce(p_candidate_payload->>'guardian_1_contact',''),'\D','','g'),'');
  v_contact_2:=nullif(regexp_replace(coalesce(p_candidate_payload->>'guardian_2_contact',''),'\D','','g'),'');

  if v_first is not null and v_surname is not null then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.display_name,candidate.learner_id),'[]'::jsonb)
    into v_learners
    from (
      select distinct
        l.id as learner_id,
        btrim(concat_ws(' ',l.first_names,l.surname)) as display_name,
        l.date_of_birth,
        e.admission_number
      from public.learners l
      join public.enrolments e
        on e.learner_id=l.id
       and e.tenant_id=l.tenant_id
       and e.school_id=v_job.school_id
      where l.tenant_id=v_job.tenant_id
        and lower(btrim(l.first_names))=lower(v_first)
        and lower(btrim(l.surname))=lower(v_surname)
        and (v_dob is null or l.date_of_birth=v_dob)
      order by display_name,l.id
      limit 10
    ) candidate;
  end if;

  if v_contact_1 is not null or v_contact_2 is not null then
    select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.guardian_name,candidate.guardian_id),'[]'::jsonb)
    into v_guardians
    from (
      select distinct
        gp.id as guardian_id,
        btrim(concat_ws(' ',gp.first_names,gp.surname)) as guardian_name,
        gc.contact_value
      from public.guardian_profiles gp
      join public.guardian_contacts gc
        on gc.guardian_id=gp.id and gc.tenant_id=gp.tenant_id
      join public.learner_guardians lg
        on lg.guardian_id=gp.id and lg.tenant_id=gp.tenant_id
      join public.enrolments e
        on e.learner_id=lg.learner_id
       and e.tenant_id=lg.tenant_id
       and e.school_id=v_job.school_id
      where gp.tenant_id=v_job.tenant_id
        and regexp_replace(gc.contact_value,'\D','','g') in (v_contact_1,v_contact_2)
      order by guardian_name,gp.id
      limit 10
    ) candidate;
  end if;

  v_match_status:=case
    when jsonb_array_length(v_learners)>0 or jsonb_array_length(v_guardians)>0
      then 'possible_match'
    else 'no_match'
  end;

  update public.document_intake_jobs
  set candidate_payload=p_candidate_payload,
      field_confidence=coalesce(p_field_confidence,'{}'::jsonb),
      match_candidates=jsonb_build_object('learners',v_learners,'guardians',v_guardians),
      match_status=v_match_status,
      extraction_status=case when source_kind='online_form' then 'not_required' else 'extracted' end,
      review_decision='pending',
      selected_learner_id=null,
      status='review',
      reviewed_by_user_id=null,
      reviewed_at=null,
      updated_at=now()
  where id=v_job.id;

  return jsonb_build_object(
    'job_id',v_job.id,
    'match_status',v_match_status,
    'match_candidates',jsonb_build_object('learners',v_learners,'guardians',v_guardians)
  );
end;
$$;

revoke all on function public.save_admission_intake_candidate(uuid,jsonb,jsonb)
from public,anon;
grant execute on function public.save_admission_intake_candidate(uuid,jsonb,jsonb)
to authenticated;

create or replace function public.review_admission_intake_candidate(
  p_job_id uuid,
  p_decision text,
  p_selected_learner_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_job public.document_intake_jobs%rowtype;
  v_candidate_found boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_job from public.document_intake_jobs where id=p_job_id for update;
  if not found or v_job.intake_type<>'admission' then raise exception 'Admission intake job not found'; end if;
  if not app_private.can_manage_enrolment_workflow(v_job.school_id) then raise exception 'Permission denied'; end if;
  if v_job.status<>'review' then raise exception 'Admission intake candidate is not awaiting review'; end if;
  if p_decision not in ('create_new','use_existing_learner','rejected') then raise exception 'Unsupported admission intake review decision'; end if;

  if p_decision='use_existing_learner' then
    if p_selected_learner_id is null then raise exception 'Existing learner selection is required'; end if;
    select exists(
      select 1
      from jsonb_array_elements(coalesce(v_job.match_candidates->'learners','[]'::jsonb)) item
      where (item->>'learner_id')::uuid=p_selected_learner_id
    ) into v_candidate_found;
    if not v_candidate_found then raise exception 'Selected learner is not a reviewed intake match'; end if;
  elsif p_selected_learner_id is not null then
    raise exception 'Learner selection is only valid when reusing an existing learner';
  end if;

  update public.document_intake_jobs
  set review_decision=p_decision,
      selected_learner_id=case when p_decision='use_existing_learner' then p_selected_learner_id else null end,
      match_status='reviewed',
      status=case when p_decision='rejected' then 'cancelled' else 'ready' end,
      reviewed_by_user_id=auth.uid(),
      reviewed_at=now(),
      updated_at=now()
  where id=v_job.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_job.tenant_id,v_job.school_id,auth.uid(),
    'document_intake.reviewed','document_intake_job',v_job.id,
    jsonb_build_object('decision',p_decision,'selected_learner_id',p_selected_learner_id)
  );
  return true;
end;
$$;

revoke all on function public.review_admission_intake_candidate(uuid,text,uuid)
from public,anon;
grant execute on function public.review_admission_intake_candidate(uuid,text,uuid)
to authenticated;

create or replace function public.commit_admission_intake_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_job public.document_intake_jobs%rowtype;
  v_grade_id uuid;
  v_first text;
  v_surname text;
  v_dob date;
  v_application_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_job from public.document_intake_jobs where id=p_job_id for update;
  if not found or v_job.intake_type<>'admission' then raise exception 'Admission intake job not found'; end if;
  if not app_private.can_manage_enrolment_workflow(v_job.school_id) then raise exception 'Permission denied'; end if;

  if v_job.status='committed'
     and v_job.committed_entity_type='admission_application'
     and v_job.committed_entity_id is not null then
    return v_job.committed_entity_id;
  end if;
  if v_job.status<>'ready' or v_job.review_decision not in ('create_new','use_existing_learner') then
    raise exception 'Admission intake must be reviewed before commit';
  end if;

  v_first:=nullif(btrim(v_job.candidate_payload->>'first_names'),'');
  v_surname:=nullif(btrim(v_job.candidate_payload->>'surname'),'');
  if v_first is null or v_surname is null then raise exception 'Learner first names and surname are required'; end if;
  if coalesce(v_job.candidate_payload->>'date_of_birth','') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_dob:=(v_job.candidate_payload->>'date_of_birth')::date;
  end if;
  if coalesce(v_job.candidate_payload->>'requested_grade_id','')<>'' then
    begin
      v_grade_id:=(v_job.candidate_payload->>'requested_grade_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Requested grade is invalid';
    end;
    if not exists(
      select 1 from public.grades g
      where g.id=v_grade_id and g.school_id=v_job.school_id and g.academic_year=v_job.academic_year
    ) then
      raise exception 'Requested grade is outside this school/year';
    end if;
  end if;

  insert into public.admission_applications(
    tenant_id,school_id,academic_year,requested_grade_id,
    applicant_first_names,applicant_surname,date_of_birth,
    guardian_name,guardian_contact,previous_school,source,status,
    learner_id,intake_job_id,source_provenance
  ) values(
    v_job.tenant_id,v_job.school_id,v_job.academic_year,v_grade_id,
    v_first,v_surname,v_dob,
    nullif(btrim(v_job.candidate_payload->>'guardian_1_name'),''),
    nullif(btrim(v_job.candidate_payload->>'guardian_1_contact'),''),
    nullif(btrim(v_job.candidate_payload->>'previous_school'),''),
    'import','received',
    v_job.selected_learner_id,v_job.id,
    jsonb_build_object(
      'intake_job_id',v_job.id,
      'source_kind',v_job.source_kind,
      'document_type',v_job.document_type,
      'review_decision',v_job.review_decision
    )
  ) returning id into v_application_id;

  update public.document_intake_jobs
  set status='committed',
      committed_entity_type='admission_application',
      committed_entity_id=v_application_id,
      committed_by_user_id=auth.uid(),
      committed_at=now(),
      updated_at=now()
  where id=v_job.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_job.tenant_id,v_job.school_id,auth.uid(),
    'document_intake.committed','document_intake_job',v_job.id,
    jsonb_build_object(
      'target_entity_type','admission_application',
      'target_entity_id',v_application_id,
      'selected_learner_id',v_job.selected_learner_id
    )
  );

  return v_application_id;
end;
$$;

revoke all on function public.commit_admission_intake_job(uuid)
from public,anon;
grant execute on function public.commit_admission_intake_job(uuid)
to authenticated;

-- Existing-identity reuse: an intake-reviewed learner match may be carried on the
-- pre-enrolment admission application. The canonical accepted-admission RPC remains
-- the only boundary that creates the enrolment.
create or replace function public.enrol_accepted_admission(
  p_application_id uuid,
  p_register_class_id uuid,
  p_admission_number text default null,
  p_preferred_name text default null,
  p_sex text default 'unspecified',
  p_enrolled_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_application public.admission_applications%rowtype;
  v_created jsonb;
  v_learner_id uuid;
  v_enrolment_id uuid;
  v_class public.register_classes%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_application
  from public.admission_applications
  where id=p_application_id
  for update;
  if not found then raise exception 'Admission application not found'; end if;
  if not app_private.has_school_role(v_application.school_id,array['school_admin']) then raise exception 'Permission denied'; end if;
  if v_application.status<>'accepted' then raise exception 'Only accepted admission applications can be enrolled'; end if;
  if v_application.requested_grade_id is null then raise exception 'Accepted admission must have a grade before enrolment'; end if;
  if p_register_class_id is null then raise exception 'Register class is required for enrolment'; end if;

  select * into v_class
  from public.register_classes
  where id=p_register_class_id
    and school_id=v_application.school_id
    and academic_year=v_application.academic_year
    and grade_id=v_application.requested_grade_id;
  if not found then raise exception 'Register class is outside the accepted admission grade'; end if;

  if v_application.learner_id is not null then
    if not exists(
      select 1 from public.learners l
      where l.id=v_application.learner_id and l.tenant_id=v_application.tenant_id
    ) then
      raise exception 'Matched learner identity is outside the admission tenant';
    end if;
    if exists(
      select 1 from public.enrolments e
      where e.learner_id=v_application.learner_id
        and e.school_id=v_application.school_id
        and e.academic_year=v_application.academic_year
        and e.status='current'
    ) then
      raise exception 'Matched learner already has a current enrolment for this school/year';
    end if;

    insert into public.enrolments(
      tenant_id,school_id,learner_id,academic_year,grade_id,register_class_id,
      admission_number,enrolled_from,status
    ) values(
      v_application.tenant_id,v_application.school_id,v_application.learner_id,
      v_application.academic_year,v_application.requested_grade_id,p_register_class_id,
      nullif(btrim(coalesce(p_admission_number,'')),''),
      coalesce(p_enrolled_from,current_date),'current'
    ) returning id into v_enrolment_id;
    v_learner_id:=v_application.learner_id;
  else
    v_created:=public.create_learner_enrolment(
      v_application.school_id,
      v_application.academic_year,
      v_application.requested_grade_id,
      p_register_class_id,
      v_application.applicant_first_names,
      v_application.applicant_surname,
      p_preferred_name,
      v_application.date_of_birth,
      p_sex,
      p_admission_number,
      p_enrolled_from
    );
    v_learner_id:=(v_created->>'learner_id')::uuid;
    v_enrolment_id:=(v_created->>'enrolment_id')::uuid;
  end if;

  update public.admission_applications
  set status='enrolled',
      learner_id=v_learner_id,
      enrolment_id=v_enrolment_id,
      enrolled_at=now(),
      reviewed_by_user_id=coalesce(reviewed_by_user_id,auth.uid()),
      reviewed_at=coalesce(reviewed_at,now()),
      updated_at=now()
  where id=v_application.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values (
    v_application.tenant_id,v_application.school_id,auth.uid(),
    'admission.enrolled','admission_application',v_application.id,
    jsonb_build_object(
      'learner_id',v_learner_id,
      'enrolment_id',v_enrolment_id,
      'academic_year',v_application.academic_year,
      'reused_existing_learner',v_application.learner_id is not null
    )
  );

  return jsonb_build_object(
    'application_id',v_application.id,
    'learner_id',v_learner_id,
    'enrolment_id',v_enrolment_id
  );
end;
$$;

revoke all on function public.enrol_accepted_admission(uuid,uuid,text,text,text,date)
from public,anon;
grant execute on function public.enrol_accepted_admission(uuid,uuid,text,text,text,date)
to authenticated;

comment on table public.document_intake_jobs is
'Shared staged document intake. Candidate/extraction data is source provenance only and never authoritative domain state.';
comment on table public.document_intake_artifacts is
'Private source artifacts retained with intake provenance and domain-specific access.';
comment on function public.commit_admission_intake_job(uuid) is
'Human-reviewed boundary that creates a pre-enrolment admission application only; OCR/extraction never creates learner, guardian or enrolment records.';
