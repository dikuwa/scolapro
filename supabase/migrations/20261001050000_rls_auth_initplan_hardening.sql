-- #921: allow PostgreSQL to initplan auth.uid() once per statement in five
-- hot RLS policies. Authorization predicates, roles and commands are unchanged.

drop policy if exists "teachers read own professional documents"
  on public.teacher_professional_documents;

create policy "teachers read own professional documents"
on public.teacher_professional_documents
for select
to authenticated
using (
  app_private.user_owns_teacher_professional_documents(
    (select auth.uid()),
    school_id,
    owner_staff_member_id
  )
);

drop policy if exists education_network_memberships_self_read
  on public.education_network_memberships;

create policy education_network_memberships_self_read
on public.education_network_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or app_private.has_platform_role(array['platform_admin'::text])
);

drop policy if exists examination_access_arrangements_insert
  on public.examination_access_arrangements;

create policy examination_access_arrangements_insert
on public.examination_access_arrangements
for insert
to authenticated
with check (
  recorded_by_user_id = (select auth.uid())
  and app_private.can_manage_examination_access_n10(school_id)
);

drop policy if exists examination_access_status_insert
  on public.examination_access_arrangement_status_history;

create policy examination_access_status_insert
on public.examination_access_arrangement_status_history
for insert
to authenticated
with check (
  recorded_by_user_id = (select auth.uid())
  and app_private.can_manage_examination_access_n10(school_id)
);

drop policy if exists "school members read active operational file templates"
  on public.operational_file_templates;

create policy "school members read active operational file templates"
on public.operational_file_templates
for select
to authenticated
using (
  status = any (array['active'::text, 'superseded'::text])
  and exists (
    select 1
    from public.school_memberships sm
    where sm.user_id = (select auth.uid())
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  )
  and not exists (
    select 1
    from public.platform_memberships pm
    where pm.user_id = (select auth.uid())
      and pm.role_key = any (array['platform_admin'::text, 'platform_support'::text])
      and pm.active_from <= current_date
      and (pm.active_to is null or pm.active_to >= current_date)
  )
);
