-- Admissions, transfers and progression are learner-operational workflows.
-- Generic platform administration is not sufficient authority for these mutations.

create or replace function app_private.has_school_local_role(
  p_school_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1
    from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.user_id=(select auth.uid())
      and sm.role_key=any(p_allowed_roles)
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  );
$$;

revoke all on function app_private.has_school_local_role(uuid,text[])
from public,anon,authenticated;
grant execute on function app_private.has_school_local_role(uuid,text[]) to authenticated;

create or replace function app_private.can_manage_enrolment_workflow(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1
    from public.school_memberships sm
    where sm.school_id=target_school_id
      and sm.user_id=(select auth.uid())
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  );
$$;

create or replace function app_private.user_can_manage_enrolment_workflow(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1
    from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.user_id=p_user_id
      and sm.role_key in ('school_admin','principal','deputy_principal')
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  );
$$;

revoke all on function app_private.can_manage_enrolment_workflow(uuid)
from public,anon,authenticated;
grant execute on function app_private.can_manage_enrolment_workflow(uuid) to authenticated;
revoke all on function app_private.user_can_manage_enrolment_workflow(uuid,uuid)
from public,anon,authenticated;

create or replace function app_private.enforce_admission_school_local_actor()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then return new; end if;

  if tg_op='UPDATE'
     and old.status='accepted'
     and new.status='enrolled'
     and not app_private.has_school_local_role(new.school_id,array['school_admin']) then
    raise exception 'Permission denied';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_admission_school_local_actor()
from public,anon,authenticated;

drop trigger if exists aa_admission_school_local_actor_trg on public.admission_applications;
create trigger aa_admission_school_local_actor_trg
before update on public.admission_applications
for each row execute function app_private.enforce_admission_school_local_actor();

create or replace function app_private.enforce_progression_school_local_actor()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_roles text[];
begin
  if auth.uid() is null then return new; end if;

  v_roles:=array['school_admin','principal','deputy_principal','hod'];
  if tg_op='UPDATE' and (
       (old.status='reviewed' and new.status='approved')
       or (old.status='approved' and new.status='locked')
     ) then
    v_roles:=array['school_admin','principal','deputy_principal'];
  end if;

  if not app_private.has_school_local_role(new.school_id,v_roles) then
    raise exception 'Permission denied';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_progression_school_local_actor()
from public,anon,authenticated;

drop trigger if exists aa_progression_school_local_actor_trg on public.year_end_progressions;
create trigger aa_progression_school_local_actor_trg
before insert or update on public.year_end_progressions
for each row execute function app_private.enforce_progression_school_local_actor();

drop policy if exists "academic leaders can create working progressions" on public.year_end_progressions;
create policy "academic leaders can create working progressions"
on public.year_end_progressions for insert to authenticated
with check (
  status in ('draft','reviewed')
  and app_private.has_school_local_role(school_id,array['school_admin','principal','deputy_principal','hod'])
);

drop policy if exists "academic leaders can read year end progressions" on public.year_end_progressions;
create policy "academic leaders can read year end progressions"
on public.year_end_progressions for select to authenticated
using (app_private.has_school_local_role(school_id,array['school_admin','principal','deputy_principal','hod']));

drop policy if exists "academic leaders can update working progressions" on public.year_end_progressions;
create policy "academic leaders can update working progressions"
on public.year_end_progressions for update to authenticated
using (
  status in ('draft','reviewed')
  and app_private.has_school_local_role(school_id,array['school_admin','principal','deputy_principal','hod'])
)
with check (
  status in ('draft','reviewed')
  and app_private.has_school_local_role(school_id,array['school_admin','principal','deputy_principal','hod'])
);

drop policy if exists "academic leaders can read rollover publications" on public.year_end_progression_publications;
create policy "academic leaders can read rollover publications"
on public.year_end_progression_publications for select to authenticated
using (app_private.has_school_local_role(school_id,array['school_admin','principal','deputy_principal','hod']));

create or replace function public.publish_year_end_progression(
  p_progression_id uuid,
  p_destination_register_class_id uuid default null,
  p_effective_on date default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_progression public.year_end_progressions%rowtype;
  v_source_enrolment public.enrolments%rowtype;
  v_publication_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_progression
  from public.year_end_progressions
  where id=p_progression_id;
  if not found then raise exception 'Progression decision not found'; end if;

  if not app_private.has_school_local_role(
    v_progression.school_id,
    array['school_admin','principal','deputy_principal']
  ) then
    raise exception 'Permission denied';
  end if;

  select id into v_publication_id
  from public.year_end_progression_publications
  where progression_id=v_progression.id;
  if v_publication_id is not null then return v_publication_id; end if;

  select * into v_source_enrolment
  from public.enrolments
  where id=v_progression.enrolment_id;
  if not found
     or v_source_enrolment.learner_id<>v_progression.learner_id
     or v_source_enrolment.school_id<>v_progression.school_id
     or v_source_enrolment.academic_year<>v_progression.academic_year then
    raise exception 'Progression source enrolment does not match the locked decision';
  end if;
  if v_source_enrolment.status<>'current' then
    raise exception 'Only a current source enrolment can be published into year-end rollover';
  end if;

  return public.publish_year_end_progression_internal(
    p_progression_id,
    p_destination_register_class_id,
    p_effective_on
  );
end;
$$;

revoke all on function public.publish_year_end_progression(uuid,uuid,date)
from public,anon;
grant execute on function public.publish_year_end_progression(uuid,uuid,date)
to authenticated;
