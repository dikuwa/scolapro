-- #1304: school-scoped, grade-year-specific textbook requirements.
-- A grade record already identifies the academic year, so no duplicate year is stored.
create table public.learning_resource_booklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  grade_id uuid not null references public.grades(id) on delete restrict,
  title_id uuid not null references public.learning_resource_titles(id) on delete restrict,
  copies_per_learner integer not null default 1 check (copies_per_learner between 1 and 10),
  status text not null default 'active' check (status in ('active','inactive')),
  created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, grade_id, title_id)
);

create index learning_resource_booklist_grade_idx on public.learning_resource_booklist_items(school_id, grade_id, status);
alter table public.learning_resource_booklist_items enable row level security;

create policy "school library staff read booklists"
on public.learning_resource_booklist_items for select to authenticated
using (app_private.can_view_current_school_ltsm(school_id));

create policy "authorized library staff insert booklists"
on public.learning_resource_booklist_items for insert to authenticated
with check (app_private.can_manage_ltsm(school_id) and created_by_user_id = auth.uid() and updated_by_user_id = auth.uid());

create policy "authorized library staff update booklists"
on public.learning_resource_booklist_items for update to authenticated
using (app_private.can_manage_ltsm(school_id))
with check (app_private.can_manage_ltsm(school_id) and updated_by_user_id = auth.uid());

grant select, insert, update on public.learning_resource_booklist_items to authenticated;

-- Reuse the canonical composite school/tenant parent scope checker for both foreign keys.
create trigger learning_resource_booklist_grade_scope_guard
before insert or update on public.learning_resource_booklist_items
for each row execute function app_private.enforce_parent_scope('grade_id','public.grades','school_id','required');

create trigger learning_resource_booklist_title_scope_guard
before insert or update on public.learning_resource_booklist_items
for each row execute function app_private.enforce_parent_scope('title_id','public.learning_resource_titles','school_id','required');

create table public.learning_resource_booklist_changes (
  id bigint generated always as identity primary key,
  booklist_item_id uuid not null,
  school_id uuid not null references public.schools(id) on delete restrict,
  actor_user_id uuid,
  operation text not null check (operation in ('INSERT','UPDATE')),
  previous_data jsonb,
  new_data jsonb not null,
  recorded_at timestamptz not null default now()
);
create index learning_resource_booklist_changes_school_idx on public.learning_resource_booklist_changes(school_id, recorded_at desc);
alter table public.learning_resource_booklist_changes enable row level security;
create policy "authorized school library staff read booklist history"
on public.learning_resource_booklist_changes for select to authenticated
using (app_private.can_manage_ltsm(school_id));
grant select on public.learning_resource_booklist_changes to authenticated;

create function app_private.record_learning_resource_booklist_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
       or new.school_id is distinct from old.school_id or new.grade_id is distinct from old.grade_id
       or new.title_id is distinct from old.title_id or new.created_by_user_id is distinct from old.created_by_user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Booklist identity and provenance cannot be changed';
    end if;
    new.updated_at := now();
    new.updated_by_user_id := auth.uid();
  end if;
  insert into public.learning_resource_booklist_changes (
    booklist_item_id, school_id, actor_user_id, operation, previous_data, new_data
  ) values (
    new.id, new.school_id, auth.uid(), tg_op,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new)
  );
  return new;
end;
$$;
revoke all on function app_private.record_learning_resource_booklist_change() from public, anon, authenticated;
create trigger learning_resource_booklist_audit
before insert or update on public.learning_resource_booklist_items
for each row execute function app_private.record_learning_resource_booklist_change();

comment on table public.learning_resource_booklist_items is
'Grade-year scoped textbook requirements. Absence of rows means not configured, not a zero requirement.';
