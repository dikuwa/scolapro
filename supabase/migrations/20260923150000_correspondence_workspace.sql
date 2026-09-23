-- Issue #691: governed school letterhead and correspondence workspace.
-- Drafts are editable only inside current-school leadership scope. Finalized
-- revisions are immutable snapshots and corrections append a new revision.

create table public.correspondence_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  lineage_id uuid not null default gen_random_uuid(),
  revision_number integer not null default 1 check (revision_number > 0),
  revises_document_id uuid references public.correspondence_documents(id) on delete restrict,
  revision_reason text,
  status text not null default 'draft' check (status in ('draft','finalized')),
  template_key text not null check (template_key in (
    'general_letter','circular_notice','vacancy_advertisement','parent_communication',
    'request_letter','invitation','meeting_notice','internal_memo'
  )),
  document_date date not null,
  recipient text not null default '',
  attention text not null default '',
  subject text not null default '',
  body jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  closing text not null default 'Yours faithfully',
  signatory_name text not null default '',
  signatory_position text not null default '',
  include_signature_block boolean not null default true,
  attachments text[] not null default '{}',
  author_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  finalized_by_user_id uuid references auth.users(id) on delete restrict,
  reference_number text,
  header_snapshot jsonb,
  school_identity_snapshot jsonb,
  author_snapshot jsonb,
  unique (school_id, lineage_id, revision_number),
  unique (school_id, reference_number),
  check (jsonb_typeof(body) = 'object'),
  check (cardinality(attachments) <= 20),
  check ((status = 'draft' and finalized_at is null and finalized_by_user_id is null and reference_number is null and header_snapshot is null and school_identity_snapshot is null and author_snapshot is null)
      or (status = 'finalized' and finalized_at is not null and finalized_by_user_id is not null and reference_number is not null and header_snapshot is not null and school_identity_snapshot is not null and author_snapshot is not null)),
  check ((revision_number = 1 and revises_document_id is null and revision_reason is null)
      or (revision_number > 1 and revises_document_id is not null and nullif(btrim(revision_reason),'') is not null))
);

create table public.correspondence_reference_counters (
  school_id uuid not null references public.schools(id) on delete restrict,
  calendar_year integer not null check (calendar_year between 2000 and 2200),
  next_number integer not null default 1 check (next_number > 0),
  primary key (school_id, calendar_year)
);

create index correspondence_documents_school_status_updated_idx
  on public.correspondence_documents(school_id,status,updated_at desc);
create index correspondence_documents_lineage_idx
  on public.correspondence_documents(school_id,lineage_id,revision_number desc);

create or replace function app_private.can_manage_correspondence(p_user_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select p_user_id is not null
    and app_private.user_current_school_matches(p_user_id,p_school_id)
    and not exists (
      select 1 from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    and exists (
      select 1 from public.school_memberships sm
      where sm.user_id=p_user_id and sm.school_id=p_school_id
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;

revoke all on function app_private.can_manage_correspondence(uuid,uuid) from public;
grant execute on function app_private.can_manage_correspondence(uuid,uuid) to authenticated;

create or replace function app_private.enforce_correspondence_document_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_school_tenant uuid;
  v_parent public.correspondence_documents%rowtype;
begin
  if tg_op='DELETE' then
    raise exception 'Correspondence history cannot be deleted';
  end if;

  select s.tenant_id into v_school_tenant from public.schools s where s.id=new.school_id;
  if v_school_tenant is null or new.tenant_id<>v_school_tenant then
    raise exception 'Correspondence tenant and school scope do not match';
  end if;

  if tg_op='UPDATE' then
    if old.status='finalized' then
      raise exception 'Finalized correspondence is immutable; create a revision';
    end if;
    if new.tenant_id is distinct from old.tenant_id
       or new.school_id is distinct from old.school_id
       or new.lineage_id is distinct from old.lineage_id
       or new.revision_number is distinct from old.revision_number
       or new.revises_document_id is distinct from old.revises_document_id
       or new.revision_reason is distinct from old.revision_reason
       or new.author_user_id is distinct from old.author_user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Correspondence identity and authorship are immutable';
    end if;
    new.updated_at:=now();
  end if;

  if new.revises_document_id is not null then
    select * into v_parent from public.correspondence_documents where id=new.revises_document_id;
    if v_parent.id is null or v_parent.status<>'finalized'
       or v_parent.tenant_id<>new.tenant_id or v_parent.school_id<>new.school_id
       or v_parent.lineage_id<>new.lineage_id or new.revision_number<>v_parent.revision_number+1 then
      raise exception 'Correspondence revision provenance is invalid';
    end if;
  end if;
  return new;
end;
$$;

create trigger correspondence_document_integrity
before insert or update or delete on public.correspondence_documents
for each row execute function app_private.enforce_correspondence_document_integrity();

create or replace function public.finalize_correspondence_document(
  p_document_id uuid,
  p_header_snapshot jsonb,
  p_school_identity_snapshot jsonb,
  p_author_snapshot jsonb
) returns public.correspondence_documents
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_document public.correspondence_documents%rowtype;
  v_number integer;
begin
  select * into v_document from public.correspondence_documents where id=p_document_id for update;
  if v_document.id is null then raise exception 'Correspondence document not found'; end if;
  if not app_private.can_manage_correspondence(auth.uid(),v_document.school_id) then
    raise exception 'Current-school correspondence authority required';
  end if;
  if v_document.status<>'draft' then raise exception 'Only a draft can be finalized'; end if;
  if nullif(btrim(v_document.recipient),'') is null or nullif(btrim(v_document.subject),'') is null
     or nullif(btrim(v_document.signatory_name),'') is null or nullif(btrim(v_document.signatory_position),'') is null then
    raise exception 'Recipient, subject, signatory name and position are required';
  end if;
  if p_header_snapshot is null or jsonb_typeof(p_header_snapshot)<>'object'
     or p_school_identity_snapshot is null or jsonb_typeof(p_school_identity_snapshot)<>'object'
     or p_author_snapshot is null or jsonb_typeof(p_author_snapshot)<>'object' then
    raise exception 'Finalization snapshots are required';
  end if;

  insert into public.correspondence_reference_counters(school_id,calendar_year,next_number)
  values(v_document.school_id,extract(year from v_document.document_date)::integer,2)
  on conflict(school_id,calendar_year) do update
    set next_number=public.correspondence_reference_counters.next_number+1
  returning next_number-1 into v_number;

  update public.correspondence_documents set
    status='finalized',
    finalized_at=now(),
    finalized_by_user_id=auth.uid(),
    reference_number='CORR-'||extract(year from v_document.document_date)::integer||'-'||lpad(v_number::text,5,'0'),
    header_snapshot=p_header_snapshot,
    school_identity_snapshot=p_school_identity_snapshot,
    author_snapshot=p_author_snapshot
  where id=p_document_id returning * into v_document;
  return v_document;
end;
$$;

create or replace function public.revise_correspondence_document(p_document_id uuid,p_reason text)
returns public.correspondence_documents
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_source public.correspondence_documents%rowtype;
  v_revision public.correspondence_documents%rowtype;
begin
  select * into v_source from public.correspondence_documents where id=p_document_id for update;
  if v_source.id is null then raise exception 'Correspondence document not found'; end if;
  if not app_private.can_manage_correspondence(auth.uid(),v_source.school_id) then
    raise exception 'Current-school correspondence authority required';
  end if;
  if v_source.status<>'finalized' then raise exception 'Only finalized correspondence can be revised'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A revision reason is required'; end if;
  if exists(select 1 from public.correspondence_documents d where d.revises_document_id=v_source.id) then
    raise exception 'A revision already exists for this document';
  end if;

  insert into public.correspondence_documents(
    tenant_id,school_id,lineage_id,revision_number,revises_document_id,revision_reason,
    template_key,document_date,recipient,attention,subject,body,closing,
    signatory_name,signatory_position,include_signature_block,attachments,author_user_id
  ) values (
    v_source.tenant_id,v_source.school_id,v_source.lineage_id,v_source.revision_number+1,v_source.id,btrim(p_reason),
    v_source.template_key,current_date,v_source.recipient,v_source.attention,v_source.subject,v_source.body,v_source.closing,
    v_source.signatory_name,v_source.signatory_position,v_source.include_signature_block,v_source.attachments,auth.uid()
  ) returning * into v_revision;
  return v_revision;
end;
$$;

revoke all on function public.finalize_correspondence_document(uuid,jsonb,jsonb,jsonb) from public,anon;
revoke all on function public.revise_correspondence_document(uuid,text) from public,anon;
grant execute on function public.finalize_correspondence_document(uuid,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.revise_correspondence_document(uuid,text) to authenticated;

alter table public.correspondence_documents enable row level security;
alter table public.correspondence_reference_counters enable row level security;

create policy correspondence_documents_read on public.correspondence_documents
for select to authenticated using (app_private.can_manage_correspondence((select auth.uid()),school_id));
create policy correspondence_documents_insert on public.correspondence_documents
for insert to authenticated with check (
  app_private.can_manage_correspondence((select auth.uid()),school_id)
  and author_user_id=(select auth.uid()) and status='draft'
);
create policy correspondence_documents_update_drafts on public.correspondence_documents
for update to authenticated using (
  status='draft' and app_private.can_manage_correspondence((select auth.uid()),school_id)
) with check (
  status='draft' and app_private.can_manage_correspondence((select auth.uid()),school_id)
);

revoke all on table public.correspondence_documents from public,anon;
grant select,insert,update on table public.correspondence_documents to authenticated;
revoke all on table public.correspondence_reference_counters from public,anon,authenticated;

comment on table public.correspondence_documents is
'Governed school correspondence revisions. Drafts are mutable within current-school leadership authority; finalized rows preserve immutable header, identity, author, recipient, content, attachments and reference provenance.';
