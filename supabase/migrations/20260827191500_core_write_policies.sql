create or replace function app_private.has_school_role(target_school_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_memberships sm
    where sm.school_id = target_school_id
      and sm.user_id = auth.uid()
      and sm.role_key = any(allowed_roles)
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  );
$$;

create or replace function app_private.has_tenant_role(target_tenant_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_memberships sm
    where sm.tenant_id = target_tenant_id
      and sm.user_id = auth.uid()
      and sm.role_key = any(allowed_roles)
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
  );
$$;

grant execute on function app_private.has_school_role(uuid, text[]) to authenticated;
grant execute on function app_private.has_tenant_role(uuid, text[]) to authenticated;

create policy "school leaders can update school profile"
on public.schools for update
to authenticated
using (app_private.has_school_role(id, array['school_admin','principal']))
with check (app_private.has_school_role(id, array['school_admin','principal']));

create policy "school admins can manage grades"
on public.grades for all
to authenticated
using (app_private.has_school_role(school_id, array['school_admin']))
with check (app_private.has_school_role(school_id, array['school_admin']));

create policy "school admins can manage register classes"
on public.register_classes for all
to authenticated
using (app_private.has_school_role(school_id, array['school_admin']))
with check (app_private.has_school_role(school_id, array['school_admin']));

create policy "school admins can create learner identities"
on public.learners for insert
to authenticated
with check (
  app_private.has_tenant_role(tenant_id, array['school_admin'])
);

create policy "school admins can update learner identities"
on public.learners for update
to authenticated
using (app_private.has_tenant_role(tenant_id, array['school_admin']))
with check (app_private.has_tenant_role(tenant_id, array['school_admin']));

create policy "school admins can create enrolments"
on public.enrolments for insert
to authenticated
with check (
  app_private.has_school_role(school_id, array['school_admin'])
  and exists (
    select 1 from public.learners l
    where l.id = learner_id
      and l.tenant_id = enrolments.tenant_id
  )
);

create policy "school admins can update enrolments"
on public.enrolments for update
to authenticated
using (app_private.has_school_role(school_id, array['school_admin']))
with check (app_private.has_school_role(school_id, array['school_admin']));

create policy "authenticated members can record scoped audit events"
on public.audit_events for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and school_id is not null
  and app_private.has_school_access(school_id)
);
