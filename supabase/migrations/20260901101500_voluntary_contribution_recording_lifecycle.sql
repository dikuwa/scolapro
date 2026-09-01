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
set search_path = public, app_private
as $$
declare
  v_item public.voluntary_contribution_items%rowtype;
  v_campaign public.voluntary_contribution_campaigns%rowtype;
  v_enrol public.enrolments%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_contribution_date is null then
    raise exception 'Contribution date is required';
  end if;

  select *
    into v_item
    from public.voluntary_contribution_items
   where id = p_item_id
     and active = true;

  if not found then
    raise exception 'Contribution item not found';
  end if;

  select *
    into v_campaign
    from public.voluntary_contribution_campaigns
   where id = v_item.campaign_id;

  if not found then
    raise exception 'Contribution campaign not found';
  end if;

  if v_campaign.status <> 'published' then
    raise exception 'Contribution campaign is not open for recording';
  end if;

  if p_contribution_date < v_campaign.starts_on
     or (v_campaign.ends_on is not null and p_contribution_date > v_campaign.ends_on) then
    raise exception 'Contribution date is outside the campaign period';
  end if;

  select *
    into v_enrol
    from public.enrolments
   where learner_id = p_learner_id
     and tenant_id = v_campaign.tenant_id
     and school_id = v_campaign.school_id
     and academic_year = v_campaign.academic_year
     and status = 'current'
   order by enrolled_from desc, created_at desc
   limit 1;

  if not found then
    raise exception 'Learner is not currently enrolled in this campaign year and school';
  end if;

  if not app_private.can_record_voluntary_contribution(v_campaign.school_id, p_learner_id) then
    raise exception 'Permission denied';
  end if;

  if p_received_by_staff_member_id is not null and not exists (
    select 1
      from public.staff_school_assignments ssa
     where ssa.school_id = v_campaign.school_id
       and ssa.staff_member_id = p_received_by_staff_member_id
       and ssa.effective_from <= p_contribution_date
       and (ssa.effective_to is null or ssa.effective_to >= p_contribution_date)
  ) then
    raise exception 'Receiving staff member is not actively assigned to this school';
  end if;

  insert into public.learner_voluntary_contributions(
    tenant_id,
    school_id,
    learner_id,
    enrolment_id,
    campaign_id,
    item_id,
    contribution_date,
    quantity,
    amount,
    note,
    received_by_staff_member_id,
    recorded_by_user_id
  ) values (
    v_campaign.tenant_id,
    v_campaign.school_id,
    p_learner_id,
    v_enrol.id,
    v_campaign.id,
    v_item.id,
    p_contribution_date,
    p_quantity,
    p_amount,
    nullif(btrim(coalesce(p_note,'')),''),
    p_received_by_staff_member_id,
    auth.uid()
  ) returning id into v_id;

  insert into public.audit_events(
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_campaign.tenant_id,
    v_campaign.school_id,
    auth.uid(),
    'voluntary_contribution.recorded',
    'learner',
    p_learner_id,
    jsonb_build_object(
      'contribution_id', v_id,
      'item_id', v_item.id,
      'campaign_id', v_campaign.id,
      'academic_year', v_campaign.academic_year,
      'contribution_date', p_contribution_date
    )
  );

  return v_id;
end;
$$;
