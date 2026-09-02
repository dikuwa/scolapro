create index if not exists learner_subject_registrations_tenant_school_idx
  on public.learner_subject_registrations(tenant_id,school_id);

create or replace function public.sync_learner_subject_registrations(
  p_enrolment_id uuid,
  p_subject_offering_ids uuid[],
  p_source text default 'manual',
  p_withdrawal_reason text default 'Subject selection synchronized'
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_offering public.subject_offerings%rowtype;
  v_existing public.learner_subject_registrations%rowtype;
  v_registration record;
  v_desired uuid[];
  v_offering_id uuid;
  v_source text:=btrim(coalesce(p_source,''));
  v_reason text:=nullif(btrim(coalesce(p_withdrawal_reason,'')),'');
  v_registered integer:=0;
  v_reactivated integer:=0;
  v_withdrawn integer:=0;
  v_unchanged integer:=0;
  v_active integer:=0;
  v_changed integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_subject_offering_ids is null then
    raise exception 'Subject offering selection is required; use an empty array to clear all choices';
  end if;
  if v_source='' then raise exception 'Registration source is required'; end if;

  select * into v_enrolment
  from public.enrolments
  where id=p_enrolment_id
  for update;
  if not found then raise exception 'Enrolment not found'; end if;
  if not app_private.can_manage_learner_subject_registrations(v_enrolment.school_id) then
    raise exception 'Permission denied';
  end if;
  if v_enrolment.grade_id is null then
    raise exception 'Learner subject registration requires an enrolment grade';
  end if;

  select coalesce(array_agg(x.id order by x.id),'{}'::uuid[])
  into v_desired
  from (
    select distinct u.id
    from unnest(p_subject_offering_ids) as u(id)
    where u.id is not null
  ) x;

  foreach v_offering_id in array v_desired loop
    select * into v_offering
    from public.subject_offerings
    where id=v_offering_id;
    if not found then
      raise exception 'Selected subject offering not found';
    end if;
    if v_offering.tenant_id<>v_enrolment.tenant_id
       or v_offering.school_id<>v_enrolment.school_id
       or v_offering.academic_year<>v_enrolment.academic_year then
      raise exception 'Selected subject offering does not match enrolment tenant, school, and academic year';
    end if;
    if v_offering.grade_id<>v_enrolment.grade_id then
      raise exception 'Selected subject offering grade does not match enrolment grade';
    end if;
    if v_offering.status<>'active' then
      raise exception 'Selected subject offering is not active';
    end if;
  end loop;

  perform 1
  from public.learner_subject_registrations r
  where r.enrolment_id=v_enrolment.id
  for update;

  foreach v_offering_id in array v_desired loop
    select * into v_existing
    from public.learner_subject_registrations r
    where r.enrolment_id=v_enrolment.id
      and r.subject_offering_id=v_offering_id;

    if not found then
      perform public.register_learner_subject(v_enrolment.id,v_offering_id,v_source);
      v_registered:=v_registered+1;
    elsif v_existing.status='withdrawn' then
      perform public.register_learner_subject(v_enrolment.id,v_offering_id,v_source);
      v_reactivated:=v_reactivated+1;
    else
      v_unchanged:=v_unchanged+1;
    end if;
  end loop;

  for v_registration in
    select r.id
    from public.learner_subject_registrations r
    where r.enrolment_id=v_enrolment.id
      and r.status='active'
      and not (r.subject_offering_id=any(v_desired))
    order by r.id
    for update
  loop
    perform public.withdraw_learner_subject_registration(v_registration.id,v_reason);
    v_withdrawn:=v_withdrawn+1;
  end loop;

  select count(*)::integer into v_active
  from public.learner_subject_registrations r
  where r.enrolment_id=v_enrolment.id
    and r.status='active';

  v_changed:=v_registered+v_reactivated+v_withdrawn;

  if v_changed>0 then
    insert into public.audit_events(
      tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
    ) values(
      v_enrolment.tenant_id,v_enrolment.school_id,auth.uid(),
      'learner_subject_registration.selection_synced','enrolment',v_enrolment.id,
      jsonb_build_object(
        'learner_id',v_enrolment.learner_id,
        'academic_year',v_enrolment.academic_year,
        'selected_subject_offering_ids',to_jsonb(v_desired),
        'selected_count',cardinality(v_desired),
        'registered_count',v_registered,
        'reactivated_count',v_reactivated,
        'withdrawn_count',v_withdrawn,
        'unchanged_count',v_unchanged,
        'active_count',v_active,
        'source',v_source,
        'withdrawal_reason',v_reason
      )
    );
  end if;

  return jsonb_build_object(
    'enrolment_id',v_enrolment.id,
    'learner_id',v_enrolment.learner_id,
    'academic_year',v_enrolment.academic_year,
    'selected_count',cardinality(v_desired),
    'registered_count',v_registered,
    'reactivated_count',v_reactivated,
    'withdrawn_count',v_withdrawn,
    'unchanged_count',v_unchanged,
    'active_count',v_active,
    'changed_count',v_changed
  );
end;
$$;

revoke all on function public.sync_learner_subject_registrations(uuid,uuid[],text,text)
from public,anon;
grant execute on function public.sync_learner_subject_registrations(uuid,uuid[],text,text)
to authenticated;

comment on function public.sync_learner_subject_registrations(uuid,uuid[],text,text) is
  'Atomically synchronizes an enrolment subject selection. The full desired offering set is validated before mutation, duplicate IDs are normalized, removed choices are withdrawn without deleting history, withdrawn choices are reactivated, unchanged choices remain idempotent, and meaningful changes emit both per-registration and selection-summary audit evidence.';