-- Private storage for rendered report-card artifacts.
-- No authenticated storage.objects policies are created here. Rendering workers use
-- service-role credentials, and application downloads must be authorized against
-- report_card_documents/report_card_snapshots before issuing a short-lived signed URL.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values(
  'report-card-artifacts',
  'report-card-artifacts',
  false,
  10485760,
  array['application/pdf','text/html']
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

comment on table public.report_card_documents is
'Rendered immutable report-card artifact metadata. Storage is private; access is authorized through report snapshot/document RLS and short-lived server-side signed URLs.';
