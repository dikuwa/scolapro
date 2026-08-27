create table if not exists public.learning_resource_titles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  resource_type text not null default 'textbook' check (resource_type in ('textbook','library_book','teacher_resource','device','other')),
  title text not null,
  author text,
  publisher text,
  isbn text,
  subject_code text,
  grade_code text,
  edition text,
  category text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_resource_copies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  title_id uuid not null references public.learning_resource_titles(id) on delete restrict,
  barcode text,
  asset_number text,
  acquisition_date date,
  acquisition_cost numeric(12,2) check (acquisition_cost is null or acquisition_cost >= 0),
  condition text not null default 'good' check (condition in ('new','good','fair','poor','damaged','lost')),
  availability text not null default 'available' check (availability in ('available','on_loan','reserved','repair','lost','withdrawn')),
  location_label text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, barcode),
  unique (school_id, asset_number)
);

create table if not exists public.learning_resource_loans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  copy_id uuid not null references public.learning_resource_copies(id) on delete restrict,
  learner_id uuid references public.learners(id) on delete restrict,
  staff_member_id uuid references public.staff_members(id) on delete restrict,
  issued_on date not null default current_date,
  due_on date,
  returned_on date,
  issued_condition text,
  returned_condition text,
  status text not null default 'open' check (status in ('open','returned','overdue','lost','waived')),
  issued_by_user_id uuid not null references auth.users(id) on delete restrict,
  returned_by_user_id uuid references auth.users(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((learner_id is not null)::integer + (staff_member_id is not null)::integer = 1),
  check (due_on is null or due_on >= issued_on),
  check (returned_on is null or returned_on >= issued_on)
);

create unique index if not exists learning_resource_one_open_loan_per_copy_uidx
on public.learning_resource_loans(copy_id)
where status in ('open','overdue');

create index if not exists learning_resource_titles_school_type_idx on public.learning_resource_titles(school_id, resource_type, status);
create index if not exists learning_resource_copies_title_idx on public.learning_resource_copies(title_id, availability);
create index if not exists learning_resource_loans_learner_idx on public.learning_resource_loans(school_id, learner_id, status) where learner_id is not null;
create index if not exists learning_resource_loans_staff_idx on public.learning_resource_loans(school_id, staff_member_id, status) where staff_member_id is not null;

alter table public.learning_resource_titles enable row level security;
alter table public.learning_resource_copies enable row level security;
alter table public.learning_resource_loans enable row level security;

create or replace function app_private.can_manage_ltsm(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(target_school_id, array['school_admin','principal','deputy_principal','librarian','ltsm']);
$$;

grant execute on function app_private.can_manage_ltsm(uuid) to authenticated;

create policy "authorized staff can read learning resource titles"
on public.learning_resource_titles for select to authenticated
using (app_private.can_view_operational_learners(school_id));

create policy "ltsm staff can manage learning resource titles"
on public.learning_resource_titles for all to authenticated
using (app_private.can_manage_ltsm(school_id))
with check (app_private.can_manage_ltsm(school_id));

create policy "authorized staff can read learning resource copies"
on public.learning_resource_copies for select to authenticated
using (app_private.can_view_operational_learners(school_id));

create policy "ltsm staff can manage learning resource copies"
on public.learning_resource_copies for all to authenticated
using (app_private.can_manage_ltsm(school_id))
with check (app_private.can_manage_ltsm(school_id));

create policy "authorized staff can read learning resource loans"
on public.learning_resource_loans for select to authenticated
using (app_private.can_view_operational_learners(school_id));

create policy "ltsm staff can manage learning resource loans"
on public.learning_resource_loans for all to authenticated
using (app_private.can_manage_ltsm(school_id))
with check (app_private.can_manage_ltsm(school_id));

create or replace function public.issue_learning_resource(
  p_copy_id uuid,
  p_learner_id uuid default null,
  p_staff_member_id uuid default null,
  p_due_on date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copy public.learning_resource_copies%rowtype;
  v_loan_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if (p_learner_id is null and p_staff_member_id is null) or (p_learner_id is not null and p_staff_member_id is not null) then
    raise exception 'Choose exactly one borrower';
  end if;

  select * into v_copy from public.learning_resource_copies where id = p_copy_id for update;
  if not found then raise exception 'Resource copy not found'; end if;
  if not app_private.can_manage_ltsm(v_copy.school_id) then raise exception 'Permission denied'; end if;
  if v_copy.availability <> 'available' then raise exception 'Resource copy is not available'; end if;

  if p_learner_id is not null and not exists (
    select 1 from public.enrolments e where e.school_id = v_copy.school_id and e.learner_id = p_learner_id and e.status = 'current'
  ) then raise exception 'Learner is not currently enrolled at this school'; end if;

  if p_staff_member_id is not null and not exists (
    select 1 from public.school_memberships sm where sm.school_id = v_copy.school_id and sm.staff_member_id = p_staff_member_id and sm.active_from <= current_date and (sm.active_to is null or sm.active_to >= current_date)
  ) then raise exception 'Staff member is not active at this school'; end if;

  insert into public.learning_resource_loans (
    tenant_id, school_id, copy_id, learner_id, staff_member_id, due_on, issued_condition, issued_by_user_id, notes
  ) values (
    v_copy.tenant_id, v_copy.school_id, v_copy.id, p_learner_id, p_staff_member_id, p_due_on, v_copy.condition, auth.uid(), nullif(btrim(coalesce(p_notes,'')), '')
  ) returning id into v_loan_id;

  update public.learning_resource_copies set availability = 'on_loan', updated_at = now() where id = v_copy.id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_copy.tenant_id, v_copy.school_id, auth.uid(), 'ltsm.resource.issued', 'learning_resource_loan', v_loan_id, jsonb_build_object('copy_id', v_copy.id));

  return v_loan_id;
end;
$$;

create or replace function public.return_learning_resource(
  p_loan_id uuid,
  p_returned_condition text default null,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan public.learning_resource_loans%rowtype;
  v_condition text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_loan from public.learning_resource_loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if not app_private.can_manage_ltsm(v_loan.school_id) then raise exception 'Permission denied'; end if;
  if v_loan.status not in ('open','overdue') then raise exception 'Loan is not open'; end if;

  v_condition := coalesce(nullif(btrim(coalesce(p_returned_condition,'')), ''), (select condition from public.learning_resource_copies where id = v_loan.copy_id));
  if v_condition not in ('new','good','fair','poor','damaged','lost') then raise exception 'Return condition is invalid'; end if;

  update public.learning_resource_loans
  set returned_on = current_date, returned_condition = v_condition, returned_by_user_id = auth.uid(), status = case when v_condition = 'lost' then 'lost' else 'returned' end,
      notes = coalesce(nullif(btrim(coalesce(p_notes,'')), ''), notes), updated_at = now()
  where id = p_loan_id;

  update public.learning_resource_copies
  set condition = v_condition,
      availability = case when v_condition = 'lost' then 'lost' when v_condition = 'damaged' then 'repair' else 'available' end,
      updated_at = now()
  where id = v_loan.copy_id;

  insert into public.audit_events (tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_loan.tenant_id, v_loan.school_id, auth.uid(), 'ltsm.resource.returned', 'learning_resource_loan', v_loan.id, jsonb_build_object('condition', v_condition));

  return true;
end;
$$;

revoke all on function public.issue_learning_resource(uuid,uuid,uuid,date,text) from public, anon;
grant execute on function public.issue_learning_resource(uuid,uuid,uuid,date,text) to authenticated;
revoke all on function public.return_learning_resource(uuid,text,text) from public, anon;
grant execute on function public.return_learning_resource(uuid,text,text) to authenticated;

comment on table public.learning_resource_titles is 'Shared LTSM/catalog title layer used by textbooks, library books and other learning resources.';
comment on table public.learning_resource_copies is 'Physical or uniquely tracked copies with barcode/asset identifiers and condition.';
comment on table public.learning_resource_loans is 'Borrowing history for either a learner or staff member; one open loan per copy.';