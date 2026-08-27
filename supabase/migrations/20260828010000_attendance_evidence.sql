-- Optional attendance evidence such as a medical note or parent letter.
-- Files remain private and are scoped through the same attendance permissions.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-evidence',
  'attendance-evidence',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.attendance_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  register_submission_id uuid not null references public.attendance_register_submissions(id) on delete restrict,
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  attendance_date date not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0 and file_size <= 5242880),
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists attendance_evidence_submission_idx
  on public.attendance_evidence (register_submission_id, enrolment_id);

alter table public.attendance_evidence enable row level security;

create policy "attendance recorders can read attendance evidence"
on public.attendance_evidence for select
to authenticated
using (app_private.can_record_attendance(school_id));

create policy "attendance recorders can insert attendance evidence"
on public.attendance_evidence for insert
to authenticated
with check (
  uploaded_by_user_id = auth.uid()
  and app_private.can_record_attendance(school_id)
);

create policy "uploader or school admin can delete attendance evidence"
on public.attendance_evidence for delete
to authenticated
using (
  uploaded_by_user_id = auth.uid()
  or app_private.can_manage_school_members(school_id)
);

drop policy if exists "attendance users can upload evidence" on storage.objects;
create policy "attendance users can upload evidence"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'attendance-evidence'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[2] = auth.uid()::text
  and app_private.can_record_attendance(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "attendance users can read evidence" on storage.objects;
create policy "attendance users can read evidence"
on storage.objects for select
to authenticated
using (
  bucket_id = 'attendance-evidence'
  and app_private.can_record_attendance(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "attendance uploader can delete evidence" on storage.objects;
create policy "attendance uploader can delete evidence"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'attendance-evidence'
  and (storage.foldername(name))[2] = auth.uid()::text
);

comment on table public.attendance_evidence is 'Private optional evidence attached to a learner attendance exception for an auditable register submission.';
