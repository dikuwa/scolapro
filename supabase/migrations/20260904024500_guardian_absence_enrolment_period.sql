-- Guardian absence notices are operational evidence for a learner's active school
-- enrolment. Submission must resolve an enrolment effective today, and persisted notice
-- dates must remain inside the referenced enrolment period.

create or replace function public.submit_guardian_absence_notice(
  p_learner_id uuid,
  p_absence_from date,
  p_absence_to date,
  p_reason_category text default 'other',
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_guardian_id uuid;
  v_enrol public.enrolments%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_absence_to<p_absence_from then raise exception 'Absence end date cannot precede start date'; end if;
  if p_reason_category not in ('illness','medical_appointment','compassionate','family','transport','weather','school_activity','other') then
    raise exception 'Unsupported absence reason category';
  end if;

  select gul.guardian_id into v_guardian_id
  from public.guardian_user_links gul
  join public.learner_guardians lg on lg.guardian_id=gul.guardian_id
  where gul.user_id=auth.uid()
    and lg.learner_id=p_learner_id
    and lg.effective_from<=current_date
    and (lg.effective_to is null or lg.effective_to>=current_date)
  order by lg.priority
  limit 1;

  if v_guardian_id is null then raise exception 'You are not linked to this learner'; end if;

  select * into v_enrol
  from public.enrolments
  where learner_id=p_learner_id
    and status='current'
    and enrolled_from<=current_date
    and (enrolled_to is null or enrolled_to>=current_date)
  order by academic_year desc,enrolled_from desc
  limit 1;

  if not found then raise exception 'Current learner enrolment not found'; end if;

  if p_absence_from<v_enrol.enrolled_from
    or (v_enrol.enrolled_to is not null and p_absence_to>v_enrol.enrolled_to) then
    raise exception 'Absence period is outside the learner enrolment period';
  end if;

  insert into public.guardian_absence_notices(
    tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,
    absence_from,absence_to,reason_category,message
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,p_learner_id,v_enrol.id,v_guardian_id,auth.uid(),
    p_absence_from,p_absence_to,p_reason_category,nullif(btrim(coalesce(p_message,'')),'')
  ) returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,auth.uid(),
    'guardian.absence_notice.submitted','guardian_absence_notice',v_id,
    jsonb_build_object('learner_id',p_learner_id,'absence_from',p_absence_from,'absence_to',p_absence_to)
  );

  return v_id;
end;
$$;

create or replace function app_private.enforce_guardian_absence_notice_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_school_tenant uuid;
  v_learner_tenant uuid;
  v_enrol public.enrolments%rowtype;
  v_guardian_tenant uuid;
begin
  if tg_op='UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.guardian_id is distinct from old.guardian_id
    or new.submitted_by_user_id is distinct from old.submitted_by_user_id
  ) then
    raise exception 'Guardian absence notice tenant, school, learner, enrolment, guardian, and submitter are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id=new.school_id;

  if v_school_tenant is null or v_school_tenant<>new.tenant_id then
    raise exception 'Guardian absence notice scope mismatch: school does not belong to tenant';
  end if;

  select l.tenant_id into v_learner_tenant
  from public.learners l
  where l.id=new.learner_id;

  if v_learner_tenant is null or v_learner_tenant<>new.tenant_id then
    raise exception 'Guardian absence notice scope mismatch: learner does not belong to tenant';
  end if;

  select * into v_enrol
  from public.enrolments e
  where e.id=new.enrolment_id;

  if not found
    or (v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id)
       is distinct from (new.tenant_id,new.school_id,new.learner_id) then
    raise exception 'Guardian absence notice scope mismatch: enrolment does not match notice scope';
  end if;

  if new.absence_from<v_enrol.enrolled_from
    or (v_enrol.enrolled_to is not null and new.absence_to>v_enrol.enrolled_to) then
    raise exception 'Guardian absence notice scope mismatch: absence period is outside enrolment period';
  end if;

  select g.tenant_id into v_guardian_tenant
  from public.guardian_profiles g
  where g.id=new.guardian_id;

  if v_guardian_tenant is null or v_guardian_tenant<>new.tenant_id then
    raise exception 'Guardian absence notice scope mismatch: guardian does not belong to tenant';
  end if;

  if not exists(
    select 1
    from public.learner_guardians lg
    where lg.tenant_id=new.tenant_id
      and lg.learner_id=new.learner_id
      and lg.guardian_id=new.guardian_id
  ) then
    raise exception 'Guardian absence notice scope mismatch: guardian is not linked to learner';
  end if;

  if not exists(
    select 1
    from public.guardian_user_links gul
    where gul.tenant_id=new.tenant_id
      and gul.guardian_id=new.guardian_id
      and gul.user_id=new.submitted_by_user_id
  ) then
    raise exception 'Guardian absence notice scope mismatch: submitter is not linked to guardian';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_guardian_absence_notice_scope_integrity()
from public,anon,authenticated;

revoke all on function public.submit_guardian_absence_notice(uuid,date,date,text,text)
from public,anon;
grant execute on function public.submit_guardian_absence_notice(uuid,date,date,text,text)
to authenticated;

drop trigger if exists guardian_absence_notice_scope_integrity_trg
on public.guardian_absence_notices;
create trigger guardian_absence_notice_scope_integrity_trg
before insert or update of
  tenant_id,school_id,learner_id,enrolment_id,guardian_id,submitted_by_user_id,
  absence_from,absence_to
on public.guardian_absence_notices
for each row execute function app_private.enforce_guardian_absence_notice_scope_integrity();

comment on function public.submit_guardian_absence_notice(uuid,date,date,text,text) is
'Guardian absence submission requires a current-status enrolment effective today and an absence range within that enrolment period.';
