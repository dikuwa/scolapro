-- Issue #999: Calendar + aSc timetable adapters over the shared document intake.
-- Staging is review-only. Authoritative commits always call existing calendar/timetable RPCs.

alter table public.document_intake_artifacts
  drop constraint if exists document_intake_artifacts_artifact_kind_check;
alter table public.document_intake_artifacts
  add constraint document_intake_artifacts_artifact_kind_check
  check (artifact_kind in (
    'application_form','photo_passport','birth_certificate','identity_document',
    'report_card','transfer_support','supporting_document','calendar_source',
    'timetable_source','other'
  ));

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
    when p_intake_type='calendar'
      then app_private.user_targets_current_school(auth.uid(),p_school_id)
        and app_private.has_school_role(
          p_school_id,
          array['school_admin','principal','deputy_principal']
        )
    when p_intake_type='timetable'
      then app_private.user_targets_current_school(auth.uid(),p_school_id)
        and app_private.can_manage_school_members(p_school_id)
    else false
  end;
$$;

revoke all on function app_private.can_manage_document_intake(uuid,text)
from public,anon,authenticated;
grant execute on function app_private.can_manage_document_intake(uuid,text)
to authenticated;

create table public.document_intake_adapter_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.document_intake_jobs(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  row_number integer not null check (row_number>0),
  adapter_kind text not null check (adapter_kind in ('calendar','timetable')),
  source_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_payload)='object'),
  normalized_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(normalized_payload)='object'),
  source_class text
    check (source_class is null or source_class in ('national','regional','school','local')),
  resolution text not null
    check (resolution in ('create','update','ignore','conflict','unmatched','duplicate')),
  matched_entity_id uuid,
  issues jsonb not null default '[]'::jsonb
    check (jsonb_typeof(issues)='array'),
  review_decision text not null default 'pending'
    check (review_decision in ('pending','create','update','ignore')),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  commit_status text not null default 'staged'
    check (commit_status in ('staged','committed','skipped','failed')),
  committed_entity_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id,row_number)
);

create index document_intake_adapter_rows_job_idx
on public.document_intake_adapter_rows(job_id,row_number);

alter table public.document_intake_adapter_rows enable row level security;
revoke all on table public.document_intake_adapter_rows from anon,authenticated;
grant select on table public.document_intake_adapter_rows to authenticated;

create policy "authorized managers read document intake adapter rows"
on public.document_intake_adapter_rows
for select to authenticated
using (
  exists(
    select 1
    from public.document_intake_jobs j
    where j.id=job_id
      and j.school_id=document_intake_adapter_rows.school_id
      and j.tenant_id=document_intake_adapter_rows.tenant_id
      and j.intake_type=document_intake_adapter_rows.adapter_kind
      and app_private.can_manage_document_intake(j.school_id,j.intake_type)
  )
);

create or replace function public.create_operational_intake_job(
  p_school_id uuid,
  p_academic_year integer,
  p_intake_type text,
  p_source_kind text default 'structured_import',
  p_document_type text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_tenant_id uuid;
  v_id uuid;
  v_document_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_academic_year<2000 or p_academic_year>2200 then raise exception 'Academic year is invalid'; end if;
  if p_intake_type not in ('calendar','timetable') then raise exception 'Unsupported operational intake type'; end if;
  if p_source_kind not in ('structured_import','upload','scan') then raise exception 'Unsupported operational intake source'; end if;
  if not app_private.can_manage_document_intake(p_school_id,p_intake_type) then raise exception 'Permission denied'; end if;

  select tenant_id into v_tenant_id
  from public.schools
  where id=p_school_id and status='active';
  if v_tenant_id is null then raise exception 'School not found or inactive'; end if;

  v_document_type:=coalesce(
    nullif(btrim(coalesce(p_document_type,'')),''),
    case when p_intake_type='calendar' then 'calendar_import' else 'asc_timetable_import' end
  );

  insert into public.document_intake_jobs(
    tenant_id,school_id,academic_year,intake_type,document_type,source_kind,
    extraction_status,created_by_user_id
  ) values(
    v_tenant_id,p_school_id,p_academic_year,p_intake_type,v_document_type,p_source_kind,
    case when p_source_kind='structured_import' then 'not_required' else 'pending' end,
    auth.uid()
  )
  returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_tenant_id,p_school_id,auth.uid(),
    'document_intake.created','document_intake_job',v_id,
    jsonb_build_object(
      'intake_type',p_intake_type,
      'source_kind',p_source_kind,
      'document_type',v_document_type
    )
  );

  return v_id;
end;
$$;

revoke all on function public.create_operational_intake_job(uuid,integer,text,text,text)
from public,anon;
grant execute on function public.create_operational_intake_job(uuid,integer,text,text,text)
to authenticated;

create or replace function app_private.classify_operational_intake_payload(
  p_job_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_job public.document_intake_jobs%rowtype;
  v_normalized jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_issues jsonb:='[]'::jsonb;
  v_resolution text:='create';
  v_match uuid;
  v_source_class text;
  v_title text;
  v_category text;
  v_starts_on date;
  v_ends_on date;
  v_starts_at time;
  v_ends_at time;
  v_impact text;
  v_class_id uuid;
  v_period_id uuid;
  v_allocation_id uuid;
  v_weekday smallint;
  v_period_number integer;
  v_cycle_code text;
  v_employee text;
  v_subject_code text;
  v_class_code text;
  v_count integer;
begin
  select * into v_job
  from public.document_intake_jobs
  where id=p_job_id;

  if not found or v_job.intake_type not in ('calendar','timetable') then
    raise exception 'Operational intake job not found';
  end if;

  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then
    raise exception 'Operational intake row payload must be an object';
  end if;

  if v_job.intake_type='calendar' then
    v_title:=nullif(btrim(p_payload->>'title'),'');
    v_category:=nullif(btrim(p_payload->>'category'),'');
    v_source_class:=lower(coalesce(nullif(btrim(p_payload->>'source_class'),''),'school'));
    v_impact:=upper(coalesce(nullif(btrim(p_payload->>'teaching_impact'),''),'NORMAL'));

    if v_title is null then
      v_issues:=v_issues||jsonb_build_array('Event title is required.');
    end if;
    if v_category is null then
      v_issues:=v_issues||jsonb_build_array('Event category is required.');
    end if;
    if v_source_class not in ('national','regional','school','local') then
      v_issues:=v_issues||jsonb_build_array('Source class must be national, regional, school or local.');
    end if;
    if v_impact not in ('NORMAL','NO_TEACHING','PARTIAL_DAY','ALTERED_TIMETABLE','EXAM_TIMETABLE') then
      v_issues:=v_issues||jsonb_build_array('Teaching impact is not supported.');
    end if;

    begin
      v_starts_on:=(p_payload->>'starts_on')::date;
      v_ends_on:=(p_payload->>'ends_on')::date;
      if v_ends_on<v_starts_on then
        v_issues:=v_issues||jsonb_build_array('End date cannot be before start date.');
      end if;
    exception when others then
      v_issues:=v_issues||jsonb_build_array('Start and end dates must be valid ISO dates.');
    end;

    begin
      if nullif(btrim(p_payload->>'starts_at'),'') is not null then
        v_starts_at:=(p_payload->>'starts_at')::time;
      end if;
      if nullif(btrim(p_payload->>'ends_at'),'') is not null then
        v_ends_at:=(p_payload->>'ends_at')::time;
      end if;
      if (v_starts_at is null)<>(v_ends_at is null) then
        v_issues:=v_issues||jsonb_build_array('Provide both start and end times or leave both blank.');
      elsif v_starts_at is not null and v_ends_at<=v_starts_at then
        v_issues:=v_issues||jsonb_build_array('End time must be after start time.');
      end if;
    exception when others then
      v_issues:=v_issues||jsonb_build_array('Event times are invalid.');
    end;

    v_normalized:=jsonb_strip_nulls(jsonb_build_object(
      'title',v_title,
      'category',v_category,
      'starts_on',case when v_starts_on is not null then v_starts_on::text end,
      'ends_on',case when v_ends_on is not null then v_ends_on::text end,
      'starts_at',case when v_starts_at is not null then to_char(v_starts_at,'HH24:MI') end,
      'ends_at',case when v_ends_at is not null then to_char(v_ends_at,'HH24:MI') end,
      'audience_scope',coalesce(nullif(btrim(p_payload->>'audience_scope'),''),'all_learners'),
      'audience_reference_id',nullif(btrim(p_payload->>'audience_reference_id'),''),
      'description',nullif(btrim(p_payload->>'description'),''),
      'teaching_impact',v_impact,
      'bell_schedule_id',nullif(btrim(p_payload->>'bell_schedule_id'),''),
      'source_class',v_source_class
    ));

    if jsonb_array_length(v_issues)>0 then
      v_resolution:='conflict';
    else
      select count(*)::integer,min(e.id::text)::uuid
      into v_count,v_match
      from public.effective_learner_calendar_events e
      where e.event_scope='school'
        and e.school_id=v_job.school_id
        and e.academic_year=v_job.academic_year
        and lower(btrim(e.title))=lower(v_title);

      if v_count>1 then
        v_match:=null;
        v_resolution:='conflict';
        v_issues:=v_issues||jsonb_build_array(
          'Multiple active calendar events share this title; choose a unique title or correct the source row before review.'
        );
      elsif v_count=1 then
        if exists(
          select 1
          from public.effective_learner_calendar_events e
          where e.id=v_match
            and lower(btrim(e.category))=lower(v_category)
            and e.starts_on=v_starts_on
            and e.ends_on=v_ends_on
            and e.starts_at is not distinct from v_starts_at
            and e.ends_at is not distinct from v_ends_at
            and e.teaching_impact=v_impact
        ) then
          v_resolution:='duplicate';
        else
          v_resolution:='update';
        end if;
      end if;
    end if;

    return jsonb_build_object(
      'resolution',v_resolution,
      'matched_entity_id',v_match,
      'normalized_payload',v_normalized,
      'source_class',v_source_class,
      'issues',v_issues
    );
  end if;

  v_employee:=upper(nullif(btrim(coalesce(
    p_payload->>'teacher_employee_number',
    p_payload->>'employee_number',
    p_payload->>'teacher_code'
  )),'')); 
  v_subject_code:=upper(nullif(btrim(p_payload->>'subject_code'),''));
  v_class_code:=upper(nullif(btrim(coalesce(p_payload->>'class_code',p_payload->>'register_class')),''));
  v_cycle_code:=upper(coalesce(nullif(btrim(coalesce(p_payload->>'cycle_code',p_payload->>'plan')),''),'A'));

  begin
    v_period_number:=(p_payload->>'period_number')::integer;
  exception when others then
    v_period_number:=null;
  end;

  v_weekday:=case lower(btrim(coalesce(p_payload->>'weekday',p_payload->>'day','')))
    when '1' then 1 when 'monday' then 1 when 'mon' then 1
    when '2' then 2 when 'tuesday' then 2 when 'tue' then 2
    when '3' then 3 when 'wednesday' then 3 when 'wed' then 3
    when '4' then 4 when 'thursday' then 4 when 'thu' then 4
    when '5' then 5 when 'friday' then 5 when 'fri' then 5
    when '6' then 6 when 'saturday' then 6 when 'sat' then 6
    when '7' then 7 when 'sunday' then 7 when 'sun' then 7
    else null
  end;

  if v_employee is null then v_issues:=v_issues||jsonb_build_array('Teacher employee number/code is required.'); end if;
  if v_subject_code is null then v_issues:=v_issues||jsonb_build_array('Subject code is required.'); end if;
  if v_class_code is null then v_issues:=v_issues||jsonb_build_array('Class code is required.'); end if;
  if v_weekday is null then v_issues:=v_issues||jsonb_build_array('Day/weekday could not be mapped.'); end if;
  if v_period_number is null or v_period_number<1 then v_issues:=v_issues||jsonb_build_array('Period number is required.'); end if;

  if jsonb_array_length(v_issues)=0 then
    select count(*),min(rc.id::text)::uuid
    into v_count,v_class_id
    from public.register_classes rc
    where rc.school_id=v_job.school_id
      and rc.academic_year=v_job.academic_year
      and upper(rc.class_code)=v_class_code;

    if v_count=0 then
      v_issues:=v_issues||jsonb_build_array('Class code is unmatched.');
    elsif v_count>1 then
      v_issues:=v_issues||jsonb_build_array('Class code is ambiguous.');
    end if;

    select count(*),min(tp.id::text)::uuid
    into v_count,v_period_id
    from public.timetable_periods tp
    where tp.school_id=v_job.school_id
      and tp.academic_year=v_job.academic_year
      and tp.period_number=v_period_number
      and tp.is_teaching_period;

    if v_count=0 then
      v_issues:=v_issues||jsonb_build_array('Teaching period is unmatched.');
    elsif v_count>1 then
      v_issues:=v_issues||jsonb_build_array('Teaching period is ambiguous.');
    end if;
  end if;

  if jsonb_array_length(v_issues)=0 then
    select count(*),min(ta.id::text)::uuid
    into v_count,v_allocation_id
    from public.teacher_allocations ta
    join public.staff_members sm on sm.id=ta.staff_member_id
    join public.subject_offerings so on so.id=ta.subject_offering_id
    join public.subjects sub on sub.id=so.subject_id
    where ta.school_id=v_job.school_id
      and ta.academic_year=v_job.academic_year
      and ta.register_class_id=v_class_id
      and ta.active_to is null
      and upper(sm.employee_number)=v_employee
      and upper(sub.subject_code)=v_subject_code;

    if v_count=0 then
      v_issues:=v_issues||jsonb_build_array('Teacher/subject/class allocation is unmatched.');
    elsif v_count>1 then
      v_issues:=v_issues||jsonb_build_array('Teacher/subject/class allocation is ambiguous.');
    end if;
  end if;

  if jsonb_array_length(v_issues)>0 then
    v_resolution:='unmatched';
  else
    select ts.id into v_match
    from public.timetable_slots ts
    where ts.school_id=v_job.school_id
      and ts.academic_year=v_job.academic_year
      and ts.status='active'
      and ts.cycle_code=v_cycle_code
      and ts.weekday=v_weekday
      and ts.period_id=v_period_id
      and ts.register_class_id=v_class_id
      and ts.teacher_allocation_id=v_allocation_id
    order by ts.created_at,ts.id
    limit 1;

    if v_match is not null then
      v_resolution:='duplicate';
    else
      select ts.id into v_match
      from public.timetable_slots ts
      where ts.school_id=v_job.school_id
        and ts.academic_year=v_job.academic_year
        and ts.status='active'
        and ts.cycle_code=v_cycle_code
        and ts.weekday=v_weekday
        and ts.period_id=v_period_id
        and (
          ts.register_class_id=v_class_id
          or ts.teacher_allocation_id=v_allocation_id
        )
      order by ts.created_at,ts.id
      limit 1;

      if v_match is not null then v_resolution:='conflict'; end if;
    end if;
  end if;

  v_normalized:=jsonb_strip_nulls(jsonb_build_object(
    'teacher_employee_number',v_employee,
    'subject_code',v_subject_code,
    'class_code',v_class_code,
    'group_code',nullif(btrim(p_payload->>'group_code'),''),
    'weekday',v_weekday,
    'period_number',v_period_number,
    'cycle_code',v_cycle_code,
    'room_label',nullif(btrim(coalesce(p_payload->>'room_label',p_payload->>'room')),''),
    'register_class_id',v_class_id,
    'period_id',v_period_id,
    'teacher_allocation_id',v_allocation_id
  ));

  return jsonb_build_object(
    'resolution',v_resolution,
    'matched_entity_id',v_match,
    'normalized_payload',v_normalized,
    'source_class',null,
    'issues',v_issues
  );
end;
$$;

revoke all on function app_private.classify_operational_intake_payload(uuid,jsonb)
from public,anon,authenticated;

create or replace function public.stage_operational_intake_rows(
  p_job_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_job public.document_intake_jobs%rowtype;
  v_item jsonb;
  v_classification jsonb;
  v_count integer:=0;
  v_row_number integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb))<>'array' then raise exception 'Operational intake rows must be an array'; end if;
  if jsonb_array_length(p_rows)>1000 then raise exception 'Operational intake is limited to 1000 rows per job'; end if;

  select * into v_job
  from public.document_intake_jobs
  where id=p_job_id
  for update;

  if not found or v_job.intake_type not in ('calendar','timetable') then raise exception 'Operational intake job not found'; end if;
  if not app_private.can_manage_document_intake(v_job.school_id,v_job.intake_type) then raise exception 'Permission denied'; end if;
  if v_job.status in ('committed','cancelled') then raise exception 'Operational intake job is no longer editable'; end if;
  if exists(select 1 from public.document_intake_adapter_rows r where r.job_id=v_job.id and r.review_decision<>'pending') then
    raise exception 'Reviewed intake rows cannot be replaced; start a new intake job';
  end if;

  delete from public.document_intake_adapter_rows where job_id=v_job.id;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_count:=v_count+1;
    v_row_number:=coalesce(nullif(v_item->>'row_number','')::integer,v_count+1);
    v_classification:=app_private.classify_operational_intake_payload(
      v_job.id,
      coalesce(v_item->'normalized',v_item->'source','{}'::jsonb)
    );

    insert into public.document_intake_adapter_rows(
      job_id,tenant_id,school_id,row_number,adapter_kind,source_payload,normalized_payload,
      source_class,resolution,matched_entity_id,issues
    ) values(
      v_job.id,v_job.tenant_id,v_job.school_id,v_row_number,v_job.intake_type,
      coalesce(v_item->'source','{}'::jsonb),
      v_classification->'normalized_payload',
      nullif(v_classification->>'source_class',''),
      v_classification->>'resolution',
      nullif(v_classification->>'matched_entity_id','')::uuid,
      v_classification->'issues'
    );
  end loop;

  update public.document_intake_jobs
  set extraction_status=case when source_kind='structured_import' then 'not_required' else 'extracted' end,
      status='review',
      updated_at=now()
  where id=v_job.id;

  return v_count;
end;
$$;

revoke all on function public.stage_operational_intake_rows(uuid,jsonb)
from public,anon;
grant execute on function public.stage_operational_intake_rows(uuid,jsonb)
to authenticated;

create or replace function public.correct_operational_intake_row(
  p_row_id uuid,
  p_normalized_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_row public.document_intake_adapter_rows%rowtype;
  v_job public.document_intake_jobs%rowtype;
  v_classification jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_row
  from public.document_intake_adapter_rows
  where id=p_row_id
  for update;
  if not found then raise exception 'Operational intake row not found'; end if;

  select * into v_job from public.document_intake_jobs where id=v_row.job_id for update;
  if not app_private.can_manage_document_intake(v_job.school_id,v_job.intake_type) then raise exception 'Permission denied'; end if;
  if v_job.status in ('committed','cancelled') then raise exception 'Operational intake job is no longer editable'; end if;

  v_classification:=app_private.classify_operational_intake_payload(v_job.id,p_normalized_payload);

  update public.document_intake_adapter_rows
  set normalized_payload=v_classification->'normalized_payload',
      source_class=nullif(v_classification->>'source_class',''),
      resolution=v_classification->>'resolution',
      matched_entity_id=nullif(v_classification->>'matched_entity_id','')::uuid,
      issues=v_classification->'issues',
      review_decision='pending',
      reviewed_by_user_id=null,
      reviewed_at=null,
      updated_at=now()
  where id=v_row.id;

  update public.document_intake_jobs
  set status='review',updated_at=now()
  where id=v_job.id;

  return v_classification;
end;
$$;

revoke all on function public.correct_operational_intake_row(uuid,jsonb)
from public,anon;
grant execute on function public.correct_operational_intake_row(uuid,jsonb)
to authenticated;

create or replace function public.review_operational_intake_row(
  p_row_id uuid,
  p_decision text
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_row public.document_intake_adapter_rows%rowtype;
  v_job public.document_intake_jobs%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_row
  from public.document_intake_adapter_rows
  where id=p_row_id
  for update;
  if not found then raise exception 'Operational intake row not found'; end if;

  select * into v_job from public.document_intake_jobs where id=v_row.job_id for update;
  if not app_private.can_manage_document_intake(v_job.school_id,v_job.intake_type) then raise exception 'Permission denied'; end if;
  if v_job.status<>'review' then raise exception 'Operational intake job is not awaiting review'; end if;
  if p_decision not in ('create','update','ignore') then raise exception 'Unsupported operational intake review decision'; end if;

  if v_row.resolution='create' and p_decision not in ('create','ignore') then
    raise exception 'Create candidate may only be created or ignored';
  elsif v_row.resolution='update' and p_decision not in ('update','ignore') then
    raise exception 'Update candidate may only be updated or ignored';
  elsif v_row.resolution in ('duplicate','conflict','unmatched','ignore') and p_decision<>'ignore' then
    raise exception 'Duplicate, conflict or unmatched candidate must be ignored or corrected first';
  end if;

  update public.document_intake_adapter_rows
  set review_decision=p_decision,
      reviewed_by_user_id=auth.uid(),
      reviewed_at=now(),
      updated_at=now()
  where id=v_row.id;

  if not exists(
    select 1 from public.document_intake_adapter_rows r
    where r.job_id=v_job.id and r.review_decision='pending'
  ) then
    update public.document_intake_jobs
    set status='ready',
        reviewed_by_user_id=auth.uid(),
        reviewed_at=now(),
        updated_at=now()
    where id=v_job.id;
  end if;

  return true;
end;
$$;

revoke all on function public.review_operational_intake_row(uuid,text)
from public,anon;
grant execute on function public.review_operational_intake_row(uuid,text)
to authenticated;

create or replace function public.commit_operational_intake_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_job public.document_intake_jobs%rowtype;
  v_row public.document_intake_adapter_rows%rowtype;
  v_entity_id uuid;
  v_committed integer:=0;
  v_skipped integer:=0;
  v_description text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_job
  from public.document_intake_jobs
  where id=p_job_id
  for update;

  if not found or v_job.intake_type not in ('calendar','timetable') then raise exception 'Operational intake job not found'; end if;
  if not app_private.can_manage_document_intake(v_job.school_id,v_job.intake_type) then raise exception 'Permission denied'; end if;
  if v_job.status='committed' then
    return jsonb_build_object('job_id',v_job.id,'already_committed',true);
  end if;
  if v_job.status<>'ready' then raise exception 'Operational intake job must be fully reviewed before commit'; end if;
  if exists(select 1 from public.document_intake_adapter_rows r where r.job_id=v_job.id and r.review_decision='pending') then
    raise exception 'Every operational intake row requires a human review decision';
  end if;

  for v_row in
    select * from public.document_intake_adapter_rows
    where job_id=v_job.id
    order by row_number,id
    for update
  loop
    if v_row.review_decision='ignore' then
      update public.document_intake_adapter_rows
      set commit_status='skipped',updated_at=now()
      where id=v_row.id;
      v_skipped:=v_skipped+1;
      continue;
    end if;

    if v_job.intake_type='calendar' then
      v_description:=nullif(btrim(coalesce(v_row.normalized_payload->>'description','')),'');
      v_description:=concat_ws(
        E'\n',
        v_description,
        format(
          '[Imported via intake %s · source class %s · source row %s]',
          v_job.id,
          coalesce(v_row.source_class,'school'),
          v_row.row_number
        )
      );

      select public.create_school_learner_calendar_event(
        v_job.school_id,
        v_job.academic_year,
        v_row.normalized_payload->>'title',
        v_row.normalized_payload->>'category',
        (v_row.normalized_payload->>'starts_on')::date,
        (v_row.normalized_payload->>'ends_on')::date,
        nullif(v_row.normalized_payload->>'starts_at','')::time,
        nullif(v_row.normalized_payload->>'ends_at','')::time,
        coalesce(nullif(v_row.normalized_payload->>'audience_scope',''),'all_learners'),
        nullif(v_row.normalized_payload->>'audience_reference_id','')::uuid,
        v_description,
        coalesce(nullif(v_row.normalized_payload->>'teaching_impact',''),'NORMAL'),
        nullif(v_row.normalized_payload->>'bell_schedule_id','')::uuid,
        case when v_row.review_decision='update' then v_row.matched_entity_id else null end,
        'active'
      ) into v_entity_id;
    else
      if v_row.review_decision<>'create' then
        raise exception 'Timetable intake rows can only create canonical slots or be ignored';
      end if;

      select public.create_timetable_slot(
        v_job.school_id,
        v_job.academic_year,
        v_row.normalized_payload->>'cycle_code',
        (v_row.normalized_payload->>'weekday')::smallint,
        (v_row.normalized_payload->>'period_id')::uuid,
        (v_row.normalized_payload->>'register_class_id')::uuid,
        (v_row.normalized_payload->>'teacher_allocation_id')::uuid,
        nullif(v_row.normalized_payload->>'room_label','')
      ) into v_entity_id;
    end if;

    update public.document_intake_adapter_rows
    set commit_status='committed',
        committed_entity_id=v_entity_id,
        error_message=null,
        updated_at=now()
    where id=v_row.id;
    v_committed:=v_committed+1;
  end loop;

  update public.document_intake_jobs
  set status='committed',
      committed_entity_type=case when intake_type='calendar' then 'learner_calendar_event_batch' else 'timetable_slot_batch' end,
      committed_entity_id=id,
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
      'intake_type',v_job.intake_type,
      'committed_rows',v_committed,
      'skipped_rows',v_skipped,
      'source_kind',v_job.source_kind
    )
  );

  return jsonb_build_object(
    'job_id',v_job.id,
    'intake_type',v_job.intake_type,
    'committed_rows',v_committed,
    'skipped_rows',v_skipped
  );
end;
$$;

revoke all on function public.commit_operational_intake_job(uuid)
from public,anon;
grant execute on function public.commit_operational_intake_job(uuid)
to authenticated;

comment on table public.document_intake_adapter_rows is
'Review-only Calendar/aSc staging over shared document intake. Rows retain source/normalized provenance and may commit only through existing canonical calendar/timetable RPCs.';
comment on function public.commit_operational_intake_job(uuid) is
'Commits fully human-reviewed adapter rows through create_school_learner_calendar_event or create_timetable_slot. Never writes a second calendar or timetable engine.';
