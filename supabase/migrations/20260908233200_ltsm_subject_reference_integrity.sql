-- Bind subject-linked learning resources to the canonical school subject record.
-- Keep subject_code as a compatibility/history snapshot, but do not allow new shadow
-- subject facts to be authored independently of public.subjects.

alter table public.learning_resource_titles
  add column if not exists subject_id uuid references public.subjects(id) on delete restrict;

create index if not exists learning_resource_titles_subject_idx
  on public.learning_resource_titles(school_id, subject_id)
  where subject_id is not null;

-- Best-effort legacy reconciliation. Unmatched historical text is preserved rather than
-- silently discarded; the trigger below prevents any new/edited subject link from being
-- non-canonical.
update public.learning_resource_titles lrt
set subject_id = s.id,
    subject_code = s.subject_code
from public.subjects s
where lrt.subject_id is null
  and nullif(btrim(coalesce(lrt.subject_code, '')), '') is not null
  and s.tenant_id = lrt.tenant_id
  and s.school_id = lrt.school_id
  and upper(btrim(s.subject_code)) = upper(btrim(lrt.subject_code));

create or replace function app_private.enforce_learning_resource_title_subject_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_subject public.subjects%rowtype;
begin
  if new.subject_id is null then
    if nullif(btrim(coalesce(new.subject_code, '')), '') is null then
      new.subject_code := null;
      return new;
    end if;

    select s.* into v_subject
    from public.subjects s
    where s.tenant_id = new.tenant_id
      and s.school_id = new.school_id
      and upper(btrim(s.subject_code)) = upper(btrim(new.subject_code));

    if not found then
      raise exception 'Learning resource subject must reference a canonical school subject';
    end if;

    new.subject_id := v_subject.id;
    new.subject_code := v_subject.subject_code;
    return new;
  end if;

  select s.* into v_subject
  from public.subjects s
  where s.id = new.subject_id;

  if not found then
    raise exception 'Learning resource subject not found';
  end if;

  if v_subject.tenant_id <> new.tenant_id or v_subject.school_id <> new.school_id then
    raise exception 'Learning resource subject scope mismatch';
  end if;

  -- The text column is retained only as a canonical snapshot/compatibility field.
  new.subject_code := v_subject.subject_code;
  return new;
end;
$$;

revoke all on function app_private.enforce_learning_resource_title_subject_integrity()
  from public, anon, authenticated;

drop trigger if exists learning_resource_title_subject_integrity_trg
  on public.learning_resource_titles;
create trigger learning_resource_title_subject_integrity_trg
before insert or update of subject_id, subject_code, tenant_id, school_id
on public.learning_resource_titles
for each row execute function app_private.enforce_learning_resource_title_subject_integrity();

comment on column public.learning_resource_titles.subject_id is
'Canonical school subject reference for subject-linked LTSM/library resources. Null for general resources.';
comment on column public.learning_resource_titles.subject_code is
'Compatibility/history snapshot derived from the canonical subject for new or edited subject-linked resources; not an independent subject fact.';
