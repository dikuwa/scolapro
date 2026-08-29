-- A class/register teacher responsibility is assignment-scoped, not a school-wide
-- finance permission. Keep campaign governance with leadership and allow class teachers
-- to record/read contributions only for learners currently enrolled in their assigned class.

create or replace function app_private.can_manage_voluntary_contributions(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;
revoke all on function app_private.can_manage_voluntary_contributions(uuid) from public,anon,authenticated;

create or replace function app_private.can_record_voluntary_contribution(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_manage_voluntary_contributions(p_school_id)
    or exists(
      select 1
      from public.enrolments e
      join public.register_classes rc on rc.id=e.register_class_id
      join public.staff_members staff on staff.id=rc.register_teacher_staff_id
      join public.school_memberships sm on sm.school_id=e.school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key='class_teacher'
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
      where e.school_id=p_school_id
        and e.learner_id=p_learner_id
        and e.status='current'
        and staff.user_id=(select auth.uid())
        and staff.status='active'
    );
$$;
revoke all on function app_private.can_record_voluntary_contribution(uuid,uuid) from public,anon,authenticated;

drop policy if exists "authorized staff read learner contributions" on public.learner_voluntary_contributions;
create policy "authorized scoped staff read learner contributions"
on public.learner_voluntary_contributions for select to authenticated
using (app_private.can_record_voluntary_contribution(school_id,learner_id));

create or replace function public.record_learner_voluntary_contribution(
  p_learner_id uuid,
  p_item_id uuid,
  p_contribution_date date default current_date,
  p_quantity numeric default null,
  p_amount numeric default null,
  p_note text default null,
  p_received_by_staff_member_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_item public.voluntary_contribution_items%rowtype;
  v_enrol public.enrolments%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_item
  from public.voluntary_contribution_items
  where id=p_item_id and active=true;
  if not found then raise exception 'Contribution item not found'; end if;

  select * into v_enrol
  from public.enrolments
  where learner_id=p_learner_id
    and school_id=v_item.school_id
    and status='current'
  order by academic_year desc
  limit 1;
  if not found then raise exception 'Learner is not currently enrolled in this school'; end if;

  if not app_private.can_record_voluntary_contribution(v_item.school_id,p_learner_id) then
    raise exception 'Permission denied';
  end if;

  if p_received_by_staff_member_id is not null and not exists(
    select 1
    from public.staff_school_assignments ssa
    where ssa.school_id=v_item.school_id
      and ssa.staff_member_id=p_received_by_staff_member_id
      and ssa.effective_from<=p_contribution_date
      and (ssa.effective_to is null or ssa.effective_to>=p_contribution_date)
  ) then raise exception 'Receiving staff member is not actively assigned to this school'; end if;

  insert into public.learner_voluntary_contributions(
    tenant_id,school_id,learner_id,enrolment_id,campaign_id,item_id,contribution_date,
    quantity,amount,note,received_by_staff_member_id,recorded_by_user_id
  ) values(
    v_item.tenant_id,v_item.school_id,p_learner_id,v_enrol.id,v_item.campaign_id,v_item.id,p_contribution_date,
    p_quantity,p_amount,nullif(btrim(coalesce(p_note,'')),''),p_received_by_staff_member_id,auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_item.tenant_id,v_item.school_id,auth.uid(),'voluntary_contribution.recorded','learner',p_learner_id,
    jsonb_build_object('contribution_id',v_id,'item_id',v_item.id,'campaign_id',v_item.campaign_id)
  );

  return v_id;
end;
$$;

revoke all on function public.record_learner_voluntary_contribution(uuid,uuid,date,numeric,numeric,text,uuid) from public,anon;
grant execute on function public.record_learner_voluntary_contribution(uuid,uuid,date,numeric,numeric,text,uuid) to authenticated;

comment on function app_private.can_record_voluntary_contribution(uuid,uuid) is
'Leadership may record/read school-wide contributions; a class_teacher may record/read only for a current learner in the register class assigned to that teacher.';
