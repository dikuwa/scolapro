-- Issue #683: configurable HOD preparation review cadence and comment-only review events.
-- Extends the canonical preparation_submissions / preparation_review_events model.

create table if not exists public.preparation_review_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  cadence text not null check (cadence in ('weekly','fortnightly','selected','term_batch')),
  effective_from date not null default current_date,
  effective_to date,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index if not exists preparation_review_policies_school_start_idx
  on public.preparation_review_policies(school_id,effective_from);

create index if not exists preparation_review_policies_current_idx
  on public.preparation_review_policies(school_id,effective_from desc,effective_to);

alter table public.preparation_review_policies enable row level security;
revoke all on public.preparation_review_policies from anon;
grant select on public.preparation_review_policies to authenticated;

create policy "current school staff read preparation review policy"
on public.preparation_review_policies
for select to authenticated
using (
  app_private.user_current_school_matches((select auth.uid()),school_id)
  and app_private.has_school_access(school_id)
);

create or replace function public.set_preparation_review_policy(
  p_school_id uuid,
  p_cadence text,
  p_effective_from date default current_date
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_tenant uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_cadence not in ('weekly','fortnightly','selected','term_batch') then
    raise exception 'Unsupported preparation review cadence';
  end if;
  if not app_private.user_current_school_matches(auth.uid(),p_school_id)
     or not app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;

  select tenant_id into v_tenant from public.schools where id=p_school_id;
  if v_tenant is null then raise exception 'School not found'; end if;

  update public.preparation_review_policies
     set effective_to=p_effective_from-1
   where school_id=p_school_id
     and effective_from<p_effective_from
     and (effective_to is null or effective_to>=p_effective_from);

  insert into public.preparation_review_policies(
    tenant_id,school_id,cadence,effective_from,created_by_user_id
  ) values(
    v_tenant,p_school_id,p_cadence,p_effective_from,auth.uid()
  )
  on conflict (school_id,effective_from)
  do update set cadence=excluded.cadence,created_by_user_id=auth.uid()
  returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_tenant,p_school_id,auth.uid(),'teaching.preparation.review_policy_set',
    'preparation_review_policy',v_id,
    jsonb_build_object('cadence',p_cadence,'effective_from',p_effective_from)
  );

  return v_id;
end;
$$;

revoke all on function public.set_preparation_review_policy(uuid,text,date) from public,anon;
grant execute on function public.set_preparation_review_policy(uuid,text,date) to authenticated;

create or replace function public.comment_on_preparation_submission(
  p_submission_id uuid,
  p_comment text
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_submission public.preparation_submissions%rowtype;
  v_actor_role text;
  v_staff_member_id uuid;
  v_staff_assignment_id uuid;
  v_comment text:=nullif(btrim(coalesce(p_comment,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_comment is null then raise exception 'A comment is required'; end if;

  select * into v_submission
  from public.preparation_submissions
  where id=p_submission_id
  for update;
  if not found then raise exception 'Preparation submission not found'; end if;

  if not app_private.can_review_preparation_submission(p_submission_id) then
    raise exception 'Permission denied: reviewer is not authorized for this submission';
  end if;

  if app_private.has_platform_role(array['platform_admin']) then
    v_actor_role:='platform_admin';
  else
    select sm.role_key,sm.staff_member_id,ssa.id
      into v_actor_role,v_staff_member_id,v_staff_assignment_id
    from public.school_memberships sm
    left join public.staff_school_assignments ssa
      on ssa.staff_member_id=sm.staff_member_id
     and ssa.school_id=sm.school_id
     and ssa.effective_from<=current_date
     and (ssa.effective_to is null or ssa.effective_to>=current_date)
    where sm.school_id=v_submission.school_id
      and sm.user_id=auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal','hod')
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
    order by ssa.effective_from desc nulls last,sm.active_from desc
    limit 1;
  end if;
  if v_actor_role is null then raise exception 'Permission denied'; end if;

  insert into public.preparation_review_events(
    tenant_id,school_id,preparation_submission_id,event_kind,actor_user_id,
    actor_role_snapshot,actor_staff_member_id,actor_staff_assignment_id,comment
  ) values(
    v_submission.tenant_id,v_submission.school_id,v_submission.id,'commented',auth.uid(),
    v_actor_role,v_staff_member_id,v_staff_assignment_id,v_comment
  );

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_submission.tenant_id,v_submission.school_id,auth.uid(),
    'teaching.preparation.commented','preparation_submission',v_submission.id,
    jsonb_build_object('comment_length',length(v_comment))
  );

  return true;
end;
$$;

revoke all on function public.comment_on_preparation_submission(uuid,text) from public,anon;
grant execute on function public.comment_on_preparation_submission(uuid,text) to authenticated;

comment on table public.preparation_review_policies is
'Effective-dated school configuration for HOD lesson-preparation review cadence. It does not alter teacher preparation content or create a parallel submission store.';
comment on function public.comment_on_preparation_submission(uuid,text) is
'Appends a reviewer comment event without changing submission status or teacher-authored lesson preparation content.';
