-- Governed Library / Textbooks catalog, stock and class-scale circulation operations.
-- Extends the canonical LTSM tables and delegates issue/return mutations to the
-- existing hardened lifecycle RPCs rather than creating a parallel loan path.

alter table public.learning_resource_titles
  add column if not exists grade_id uuid references public.grades(id) on delete restrict;

create index if not exists learning_resource_titles_grade_idx
  on public.learning_resource_titles(school_id, grade_id)
  where grade_id is not null;

create or replace function app_private.enforce_learning_resource_title_grade_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_grade public.grades%rowtype;
begin
  if new.grade_id is null then
    return new;
  end if;

  select g.* into v_grade
  from public.grades g
  where g.id = new.grade_id;

  if not found then
    raise exception 'Learning resource grade not found';
  end if;

  if v_grade.tenant_id <> new.tenant_id or v_grade.school_id <> new.school_id then
    raise exception 'Learning resource grade scope mismatch';
  end if;

  new.grade_code := v_grade.grade_code;
  return new;
end;
$$;

revoke all on function app_private.enforce_learning_resource_title_grade_integrity()
  from public, anon, authenticated;

drop trigger if exists learning_resource_title_grade_integrity_trg
  on public.learning_resource_titles;
create trigger learning_resource_title_grade_integrity_trg
before insert or update of grade_id, grade_code, tenant_id, school_id
on public.learning_resource_titles
for each row execute function app_private.enforce_learning_resource_title_grade_integrity();

create or replace function public.save_learning_resource_title(
  p_school_id uuid,
  p_resource_type text,
  p_title text,
  p_title_id uuid default null,
  p_author text default null,
  p_publisher text default null,
  p_isbn text default null,
  p_subject_id uuid default null,
  p_grade_id uuid default null,
  p_edition text default null,
  p_category text default null,
  p_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_tenant_id uuid;
  v_title_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_status text := lower(btrim(coalesce(p_status, 'active')));
  v_type text := lower(btrim(coalesce(p_resource_type, '')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_ltsm(p_school_id) then raise exception 'Permission denied'; end if;

  select s.tenant_id into v_tenant_id from public.schools s where s.id = p_school_id;
  if v_tenant_id is null then raise exception 'School not found'; end if;
  if v_title is null then raise exception 'Title is required'; end if;
  if v_type not in ('textbook','library_book','teacher_resource','device','other') then
    raise exception 'Resource type is invalid';
  end if;
  if v_status not in ('active','inactive','archived') then raise exception 'Title status is invalid'; end if;

  if p_subject_id is not null and not exists(
    select 1 from public.subjects s
    where s.id = p_subject_id and s.school_id = p_school_id and s.tenant_id = v_tenant_id
  ) then raise exception 'Subject is not configured for this school'; end if;

  if p_grade_id is not null and not exists(
    select 1 from public.grades g
    where g.id = p_grade_id and g.school_id = p_school_id and g.tenant_id = v_tenant_id
  ) then raise exception 'Grade is not configured for this school'; end if;

  if p_title_id is null then
    insert into public.learning_resource_titles(
      tenant_id, school_id, resource_type, title, author, publisher, isbn,
      subject_id, subject_code, grade_id, grade_code, edition, category, status
    ) values (
      v_tenant_id, p_school_id, v_type, v_title,
      nullif(btrim(coalesce(p_author,'')),''),
      nullif(btrim(coalesce(p_publisher,'')),''),
      nullif(btrim(coalesce(p_isbn,'')),''),
      p_subject_id, null, p_grade_id, null,
      nullif(btrim(coalesce(p_edition,'')),''),
      nullif(btrim(coalesce(p_category,'')),''), v_status
    ) returning id into v_title_id;
  else
    if not exists(
      select 1 from public.learning_resource_titles t
      where t.id = p_title_id and t.school_id = p_school_id and t.tenant_id = v_tenant_id
    ) then raise exception 'Resource title not found'; end if;

    if v_status in ('inactive','archived') and exists(
      select 1
      from public.learning_resource_copies c
      join public.learning_resource_loans l on l.copy_id = c.id
      where c.title_id = p_title_id and l.status in ('open','overdue')
    ) then raise exception 'Resource title has active loans'; end if;

    update public.learning_resource_titles
    set resource_type = v_type,
        title = v_title,
        author = nullif(btrim(coalesce(p_author,'')),''),
        publisher = nullif(btrim(coalesce(p_publisher,'')),''),
        isbn = nullif(btrim(coalesce(p_isbn,'')),''),
        subject_id = p_subject_id,
        subject_code = null,
        grade_id = p_grade_id,
        grade_code = null,
        edition = nullif(btrim(coalesce(p_edition,'')),''),
        category = nullif(btrim(coalesce(p_category,'')),''),
        status = v_status,
        updated_at = now()
    where id = p_title_id
    returning id into v_title_id;
  end if;

  insert into public.audit_events(tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values(
    v_tenant_id, p_school_id, auth.uid(),
    case when p_title_id is null then 'ltsm.title.created' else 'ltsm.title.updated' end,
    'learning_resource_title', v_title_id,
    jsonb_build_object('status', v_status, 'resource_type', v_type)
  );

  return v_title_id;
end;
$$;

revoke all on function public.save_learning_resource_title(uuid,text,text,uuid,text,text,text,uuid,uuid,text,text,text)
  from public, anon;
grant execute on function public.save_learning_resource_title(uuid,text,text,uuid,text,text,text,uuid,uuid,text,text,text)
  to authenticated;

create or replace function public.add_learning_resource_copies(
  p_title_id uuid,
  p_copies jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_title public.learning_resource_titles%rowtype;
  v_item jsonb;
  v_count integer;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_condition text;
  v_availability text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_title from public.learning_resource_titles where id = p_title_id;
  if not found then raise exception 'Resource title not found'; end if;
  if not app_private.can_manage_ltsm(v_title.school_id) then raise exception 'Permission denied'; end if;
  if v_title.status = 'archived' then raise exception 'Cannot add stock to an archived title'; end if;
  if jsonb_typeof(p_copies) <> 'array' then raise exception 'Copies must be an array'; end if;

  v_count := jsonb_array_length(p_copies);
  if v_count < 1 or v_count > 500 then raise exception 'Copy batch must contain between 1 and 500 rows'; end if;

  for v_item in select value from jsonb_array_elements(p_copies)
  loop
    v_condition := lower(btrim(coalesce(v_item->>'condition', 'good')));
    v_availability := lower(btrim(coalesce(v_item->>'availability', 'available')));
    if v_condition not in ('new','good','fair','poor','damaged','lost') then raise exception 'Copy condition is invalid'; end if;
    if v_availability not in ('available','reserved','repair','lost','withdrawn') then
      raise exception 'Initial copy availability is invalid';
    end if;
    if v_availability = 'lost' and v_condition <> 'lost' then raise exception 'Lost copy must have lost condition'; end if;
    if v_availability <> 'lost' and v_condition = 'lost' then raise exception 'Lost condition requires lost availability'; end if;

    insert into public.learning_resource_copies(
      tenant_id, school_id, title_id, barcode, asset_number, condition, availability, location_label, notes
    ) values (
      v_title.tenant_id, v_title.school_id, v_title.id,
      nullif(btrim(coalesce(v_item->>'barcode','')),''),
      nullif(btrim(coalesce(v_item->>'asset_number','')),''),
      v_condition, v_availability,
      nullif(btrim(coalesce(v_item->>'location_label','')),''),
      nullif(btrim(coalesce(v_item->>'notes','')),'')
    ) returning id into v_id;
    v_ids := array_append(v_ids, v_id);
  end loop;

  insert into public.audit_events(tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values(
    v_title.tenant_id, v_title.school_id, auth.uid(), 'ltsm.stock.added',
    'learning_resource_title', v_title.id, jsonb_build_object('copy_count', v_count)
  );

  return v_ids;
end;
$$;

revoke all on function public.add_learning_resource_copies(uuid,jsonb) from public, anon;
grant execute on function public.add_learning_resource_copies(uuid,jsonb) to authenticated;

create or replace function app_private.enforce_learning_resource_issue_title_active()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists(
    select 1
    from public.learning_resource_copies c
    join public.learning_resource_titles t on t.id = c.title_id
    where c.id = new.copy_id
      and c.school_id = new.school_id
      and c.tenant_id = new.tenant_id
      and t.school_id = new.school_id
      and t.tenant_id = new.tenant_id
      and t.status = 'active'
  ) then raise exception 'Resource title is not active'; end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_learning_resource_issue_title_active()
  from public, anon, authenticated;

drop trigger if exists learning_resource_issue_title_active_trg on public.learning_resource_loans;
create trigger learning_resource_issue_title_active_trg
before insert on public.learning_resource_loans
for each row execute function app_private.enforce_learning_resource_issue_title_active();

create or replace function public.bulk_issue_learning_resources(
  p_pairs jsonb,
  p_due_on date default null,
  p_notes text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_item jsonb;
  v_count integer;
  v_copy_id uuid;
  v_learner_id uuid;
  v_loan_id uuid;
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_pairs) <> 'array' then raise exception 'Issue pairs must be an array'; end if;
  v_count := jsonb_array_length(p_pairs);
  if v_count < 1 or v_count > 200 then raise exception 'Bulk issue must contain between 1 and 200 rows'; end if;

  if exists(
    select 1 from (
      select value->>'copy_id' copy_id, count(*)
      from jsonb_array_elements(p_pairs)
      group by value->>'copy_id'
      having count(*) > 1
    ) d
  ) then raise exception 'A copy cannot be paired more than once'; end if;

  if exists(
    select 1 from (
      select value->>'learner_id' learner_id, count(*)
      from jsonb_array_elements(p_pairs)
      group by value->>'learner_id'
      having count(*) > 1
    ) d
  ) then raise exception 'A learner cannot be paired more than once in one bulk issue'; end if;

  for v_item in select value from jsonb_array_elements(p_pairs)
  loop
    begin
      v_copy_id := (v_item->>'copy_id')::uuid;
      v_learner_id := (v_item->>'learner_id')::uuid;
    exception when others then
      raise exception 'Bulk issue contains an invalid copy or learner identifier';
    end;

    v_loan_id := public.issue_learning_resource(v_copy_id, v_learner_id, null, p_due_on, p_notes);
    v_ids := array_append(v_ids, v_loan_id);
  end loop;

  return v_ids;
end;
$$;

revoke all on function public.bulk_issue_learning_resources(jsonb,date,text) from public, anon;
grant execute on function public.bulk_issue_learning_resources(jsonb,date,text) to authenticated;

create or replace function public.bulk_return_learning_resources(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_item jsonb;
  v_count integer;
  v_loan_id uuid;
  v_condition text;
  v_notes text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Return items must be an array'; end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 200 then raise exception 'Bulk return must contain between 1 and 200 rows'; end if;

  if exists(
    select 1 from (
      select value->>'loan_id' loan_id, count(*)
      from jsonb_array_elements(p_items)
      group by value->>'loan_id'
      having count(*) > 1
    ) d
  ) then raise exception 'A loan cannot be returned more than once in one bulk return'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_loan_id := (v_item->>'loan_id')::uuid;
    exception when others then
      raise exception 'Bulk return contains an invalid loan identifier';
    end;
    v_condition := lower(btrim(coalesce(v_item->>'condition', 'good')));
    v_notes := nullif(btrim(coalesce(v_item->>'notes','')), '');
    perform public.return_learning_resource(v_loan_id, v_condition, v_notes);
  end loop;

  return v_count;
end;
$$;

revoke all on function public.bulk_return_learning_resources(jsonb) from public, anon;
grant execute on function public.bulk_return_learning_resources(jsonb) to authenticated;

comment on column public.learning_resource_titles.grade_id is
'Canonical school grade reference for grade-specific resources. grade_code remains a derived compatibility snapshot when grade_id is set.';
comment on function public.save_learning_resource_title(uuid,text,text,uuid,text,text,text,uuid,uuid,text,text,text) is
'Governed school-local create/edit/archive operation for canonical learning-resource titles.';
comment on function public.add_learning_resource_copies(uuid,jsonb) is
'Governed school-local batch stock creation for physical resource copies.';
comment on function public.bulk_issue_learning_resources(jsonb,date,text) is
'Atomic class-scale issue wrapper that delegates every pair to canonical issue_learning_resource().';
comment on function public.bulk_return_learning_resources(jsonb) is
'Atomic class-scale return wrapper that delegates every row to canonical return_learning_resource().';
