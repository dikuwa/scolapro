-- Guardian-submitted absence/sick-note workflow. Notices never rewrite official
-- attendance automatically. They create evidence/review work for authorised school
-- staff, preserving the distinction between a parent message and the statutory register.

create table if not exists public.guardian_absence_notices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  guardian_id uuid not null references public.guardian_profiles(id) on delete restrict,
  submitted_by_user_id uuid not null references auth.users(id) on delete restrict,
  absence_from date not null,
  absence_to date not null,
  reason_category text not null default 'other' check (reason_category in ('illness','medical_appointment','compassionate','family','transport','weather','school_activity','other')),
  message text,
  status text not null default 'submitted' check (status in ('submitted','under_review','accepted','returned','closed')),
  reviewed_by_user_id uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (absence_to >= absence_from)
);
create index if not exists guardian_absence_notices_school_status_idx
  on public.guardian_absence_notices(school_id,status,absence_from desc);
create index if not exists guardian_absence_notices_learner_idx
  on public.guardian_absence_notices(learner_id,absence_from desc);

create table if not exists public.guardian_absence_notice_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  notice_id uuid not null references public.guardian_absence_notices(id) on delete cascade,
  storage_bucket text not null default 'guardian-absence-evidence',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(notice_id,storage_path)
);
create index if not exists guardian_absence_notice_attachments_notice_idx
  on public.guardian_absence_notice_attachments(notice_id,created_at);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('guardian-absence-evidence','guardian-absence-evidence',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.guardian_absence_notices enable row level security;
alter table public.guardian_absence_notice_attachments enable row level security;

create policy "guardians read own absence notices" on public.guardian_absence_notices
for select to authenticated using (submitted_by_user_id=(select auth.uid()));
create policy "school staff read learner absence notices" on public.guardian_absence_notices
for select to authenticated using (app_private.can_view_operational_learners(school_id));
create policy "guardians read own absence attachments" on public.guardian_absence_notice_attachments
for select to authenticated using (exists(select 1 from public.guardian_absence_notices n where n.id=notice_id and n.submitted_by_user_id=(select auth.uid())));
create policy "school staff read learner absence attachments" on public.guardian_absence_notice_attachments
for select to authenticated using (app_private.can_view_operational_learners(school_id));

revoke all on public.guardian_absence_notices,public.guardian_absence_notice_attachments from anon,authenticated;
grant select on public.guardian_absence_notices,public.guardian_absence_notice_attachments to authenticated;

create or replace function public.submit_guardian_absence_notice(
  p_learner_id uuid,
  p_absence_from date,
  p_absence_to date,
  p_reason_category text default 'other',
  p_message text default null
)
returns uuid
language plpgsql security definer set search_path=public,app_private as $$
declare v_guardian_id uuid; v_enrol public.enrolments%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_absence_to<p_absence_from then raise exception 'Absence end date cannot precede start date'; end if;
  if p_reason_category not in ('illness','medical_appointment','compassionate','family','transport','weather','school_activity','other') then raise exception 'Unsupported absence reason category'; end if;
  select gul.guardian_id into v_guardian_id
  from public.guardian_user_links gul
  join public.learner_guardians lg on lg.guardian_id=gul.guardian_id
  where gul.user_id=auth.uid() and lg.learner_id=p_learner_id
    and lg.effective_from<=current_date and (lg.effective_to is null or lg.effective_to>=current_date)
  order by lg.priority limit 1;
  if v_guardian_id is null then raise exception 'You are not linked to this learner'; end if;
  select * into v_enrol from public.enrolments where learner_id=p_learner_id and status='current' order by academic_year desc limit 1;
  if not found then raise exception 'Current learner enrolment not found'; end if;
  insert into public.guardian_absence_notices(tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,absence_from,absence_to,reason_category,message)
  values(v_enrol.tenant_id,v_enrol.school_id,p_learner_id,v_enrol.id,v_guardian_id,auth.uid(),p_absence_from,p_absence_to,p_reason_category,nullif(btrim(coalesce(p_message,'')),'')) returning id into v_id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_enrol.tenant_id,v_enrol.school_id,auth.uid(),'guardian.absence_notice.submitted','guardian_absence_notice',v_id,jsonb_build_object('learner_id',p_learner_id,'absence_from',p_absence_from,'absence_to',p_absence_to));
  return v_id;
end; $$;

create or replace function public.register_guardian_absence_attachment(
  p_notice_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns uuid
language plpgsql security definer set search_path=public as $$
declare v_notice public.guardian_absence_notices%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_notice from public.guardian_absence_notices where id=p_notice_id;
  if not found or v_notice.submitted_by_user_id<>auth.uid() then raise exception 'Absence notice not found'; end if;
  if v_notice.status not in ('submitted','returned') then raise exception 'Attachments can no longer be changed for this notice'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Unsupported attachment type'; end if;
  if p_file_size_bytes<=0 or p_file_size_bytes>10485760 then raise exception 'Attachment must be 10 MB or smaller'; end if;
  if btrim(coalesce(p_storage_path,''))='' or btrim(coalesce(p_file_name,''))='' then raise exception 'Attachment metadata is incomplete'; end if;
  insert into public.guardian_absence_notice_attachments(tenant_id,school_id,notice_id,storage_path,file_name,mime_type,file_size_bytes,uploaded_by_user_id)
  values(v_notice.tenant_id,v_notice.school_id,v_notice.id,btrim(p_storage_path),btrim(p_file_name),p_mime_type,p_file_size_bytes,auth.uid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.review_guardian_absence_notice(
  p_notice_id uuid,
  p_status text,
  p_review_note text default null
)
returns boolean
language plpgsql security definer set search_path=public,app_private as $$
declare v_notice public.guardian_absence_notices%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('under_review','accepted','returned','closed') then raise exception 'Unsupported review status'; end if;
  select * into v_notice from public.guardian_absence_notices where id=p_notice_id for update;
  if not found then raise exception 'Absence notice not found'; end if;
  if not app_private.can_view_operational_learners(v_notice.school_id) then raise exception 'Permission denied'; end if;
  update public.guardian_absence_notices set status=p_status,reviewed_by_user_id=auth.uid(),reviewed_at=now(),review_note=nullif(btrim(coalesce(p_review_note,'')),''),updated_at=now() where id=v_notice.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_notice.tenant_id,v_notice.school_id,auth.uid(),'guardian.absence_notice.reviewed','guardian_absence_notice',v_notice.id,jsonb_build_object('learner_id',v_notice.learner_id,'status',p_status));
  return true;
end; $$;

revoke all on function public.submit_guardian_absence_notice(uuid,date,date,text,text) from public,anon;
grant execute on function public.submit_guardian_absence_notice(uuid,date,date,text,text) to authenticated;
revoke all on function public.register_guardian_absence_attachment(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.register_guardian_absence_attachment(uuid,text,text,text,bigint) to authenticated;
revoke all on function public.review_guardian_absence_notice(uuid,text,text) from public,anon;
grant execute on function public.review_guardian_absence_notice(uuid,text,text) to authenticated;
