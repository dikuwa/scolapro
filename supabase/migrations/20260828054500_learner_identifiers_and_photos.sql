-- Stable school-level learner identifiers survive annual grade/class progression.
-- Existing enrolment.admission_number remains as a compatibility snapshot, while
-- school_learner_identifiers becomes the source of truth for the learner's
-- admission number at a school.

alter table public.learners add column if not exists photo_path text;

create table if not exists public.school_admission_sequences (
  school_id uuid primary key references public.schools(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  next_number bigint not null default 1 check (next_number > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_learner_identifiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  admission_number text not null,
  source text not null default 'generated' check (source in ('generated','manual','imported','reconciled')),
  assigned_by_user_id uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, learner_id),
  unique (admission_number)
);

create index if not exists school_learner_identifiers_school_idx on public.school_learner_identifiers(school_id, admission_number);
create index if not exists school_learner_identifiers_learner_idx on public.school_learner_identifiers(learner_id);

alter table public.school_admission_sequences enable row level security;
alter table public.school_learner_identifiers enable row level security;

create policy "school admins can read admission sequences" on public.school_admission_sequences for select to authenticated using (app_private.has_school_role(school_id, array['school_admin']));
create policy "authorized staff can read learner identifiers" on public.school_learner_identifiers for select to authenticated using (app_private.can_view_operational_learners(school_id));

create or replace function public.create_learner_enrolment(
  p_school_id uuid,
  p_academic_year integer,
  p_grade_id uuid,
  p_register_class_id uuid,
  p_first_names text,
  p_surname text,
  p_preferred_name text default null,
  p_date_of_birth date default null,
  p_sex text default 'unspecified',
  p_admission_number text default null,
  p_enrolled_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_tenant_id uuid;
  v_emis text;
  v_learner_id uuid;
  v_enrolment_id uuid;
  v_sequence bigint;
  v_admission_number text;
  v_source text;
begin
  if not app_private.has_school_role(p_school_id, array['school_admin']) then
    raise exception 'Not authorized to register learners for this school.' using errcode = '42501';
  end if;

  select s.tenant_id, nullif(regexp_replace(coalesce(s.emis_number, ''), '[^A-Za-z0-9]', '', 'g'), '')
    into v_tenant_id, v_emis
  from public.schools s
  where s.id = p_school_id and s.status = 'active';
  if v_tenant_id is null then raise exception 'School is not available.' using errcode = '22023'; end if;

  if not exists (select 1 from public.grades g where g.id = p_grade_id and g.school_id = p_school_id and g.tenant_id = v_tenant_id and g.academic_year = p_academic_year) then
    raise exception 'Grade does not belong to the selected school and academic year.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.register_classes rc where rc.id = p_register_class_id and rc.school_id = p_school_id and rc.tenant_id = v_tenant_id and rc.grade_id = p_grade_id and rc.academic_year = p_academic_year) then
    raise exception 'Register class does not belong to the selected grade.' using errcode = '22023';
  end if;
  if nullif(btrim(p_first_names), '') is null or nullif(btrim(p_surname), '') is null then raise exception 'Learner first names and surname are required.' using errcode = '22023'; end if;
  if p_sex not in ('female','male','other','unspecified') then raise exception 'Invalid learner sex value.' using errcode = '22023'; end if;

  if nullif(btrim(p_admission_number), '') is not null then
    v_admission_number := upper(btrim(p_admission_number));
    v_source := 'manual';
    if exists (select 1 from public.school_learner_identifiers where admission_number = v_admission_number) then
      raise exception 'Admission number is already in use.' using errcode = '23505';
    end if;
  else
    insert into public.school_admission_sequences (school_id, tenant_id, next_number)
    values (p_school_id, v_tenant_id, 2)
    on conflict (school_id) do update set next_number = public.school_admission_sequences.next_number + 1, updated_at = now()
    returning next_number - 1 into v_sequence;
    v_admission_number := upper(coalesce(v_emis, 'SC' || substr(replace(p_school_id::text, '-', ''), 1, 6))) || '-' || p_academic_year::text || '-' || lpad(v_sequence::text, 5, '0');
    v_source := 'generated';
  end if;

  insert into public.learners (tenant_id, first_names, surname, preferred_name, date_of_birth, sex)
  values (v_tenant_id, btrim(p_first_names), btrim(p_surname), nullif(btrim(p_preferred_name), ''), p_date_of_birth, p_sex)
  returning id into v_learner_id;

  insert into public.school_learner_identifiers (tenant_id, school_id, learner_id, admission_number, source, assigned_by_user_id)
  values (v_tenant_id, p_school_id, v_learner_id, v_admission_number, v_source, auth.uid());

  insert into public.enrolments (tenant_id, school_id, learner_id, academic_year, grade_id, register_class_id, admission_number, enrolled_from, status)
  values (v_tenant_id, p_school_id, v_learner_id, p_academic_year, p_grade_id, p_register_class_id, v_admission_number, p_enrolled_from, 'current')
  returning id into v_enrolment_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_tenant_id, p_school_id, auth.uid(), 'learner.registered', 'learner', v_learner_id,
    jsonb_build_object('enrolment_id', v_enrolment_id, 'academic_year', p_academic_year, 'grade_id', p_grade_id, 'register_class_id', p_register_class_id, 'admission_number', v_admission_number, 'admission_number_source', v_source));

  return jsonb_build_object('learner_id', v_learner_id, 'enrolment_id', v_enrolment_id, 'admission_number', v_admission_number);
end;
$$;

create or replace function public.set_learner_photo(p_learner_id uuid, p_school_id uuid, p_photo_path text)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare v_tenant_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_role(p_school_id, array['school_admin']) then raise exception 'Permission denied'; end if;
  select tenant_id into v_tenant_id from public.school_learner_identifiers where learner_id = p_learner_id and school_id = p_school_id;
  if v_tenant_id is null then raise exception 'Learner does not belong to this school'; end if;
  update public.learners set photo_path = nullif(btrim(p_photo_path), '') where id = p_learner_id and tenant_id = v_tenant_id;
  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_tenant_id, p_school_id, auth.uid(), 'learner.photo_updated', 'learner', p_learner_id, jsonb_build_object('has_photo', nullif(btrim(p_photo_path), '') is not null));
  return true;
end;
$$;

revoke all on function public.set_learner_photo(uuid,uuid,text) from public, anon;
grant execute on function public.set_learner_photo(uuid,uuid,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learner-photos', 'learner-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "school admins can upload learner photos" on storage.objects for insert to authenticated
with check (bucket_id = 'learner-photos' and app_private.has_school_role(((storage.foldername(name))[1])::uuid, array['school_admin']));
create policy "authorized school staff can read learner photos" on storage.objects for select to authenticated
using (bucket_id = 'learner-photos' and app_private.can_view_operational_learners(((storage.foldername(name))[1])::uuid));
create policy "school admins can update learner photos" on storage.objects for update to authenticated
using (bucket_id = 'learner-photos' and app_private.has_school_role(((storage.foldername(name))[1])::uuid, array['school_admin']))
with check (bucket_id = 'learner-photos' and app_private.has_school_role(((storage.foldername(name))[1])::uuid, array['school_admin']));
create policy "school admins can delete learner photos" on storage.objects for delete to authenticated
using (bucket_id = 'learner-photos' and app_private.has_school_role(((storage.foldername(name))[1])::uuid, array['school_admin']));
