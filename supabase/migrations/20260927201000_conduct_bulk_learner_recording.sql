-- Conduct recording UX: allow authorized bulk recording across a full school scope.
-- Existing scope, enrolment-date, policy, snapshot and audit protections remain unchanged.

create or replace function app_private.record_conduct_group(
  p_school_id uuid,p_category_id uuid,p_domain text,p_date date,p_title text,p_details text,
  p_severity text,p_level text,p_learner_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  c public.conduct_policy_categories%rowtype;
  v_learner uuid;
  v_enrolment uuid;
  v_id uuid;
  v_ids uuid[]:='{}';
  v_learners uuid[];
  v_group uuid;
begin
  if (select auth.uid()) is null or not app_private.has_school_role(p_school_id,
    case when p_domain='conduct'
      then array['school_admin','principal','deputy_principal','hod','teacher','class_teacher','counsellor']
      else array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']
    end) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if p_date is null
    or p_date>(now() at time zone 'Africa/Windhoek')::date
    or length(btrim(coalesce(p_title,''))) not between 1 and 240
    or length(coalesce(p_details,''))>10000 then
    raise exception 'Check event date and text';
  end if;

  if coalesce(cardinality(p_learner_ids),0)=0
    or cardinality(p_learner_ids)>1000
    or array_position(p_learner_ids,null) is not null then
    raise exception 'Choose between 1 and 1000 learners';
  end if;

  select array_agg(distinct x order by x) into v_learners
  from unnest(p_learner_ids) x;

  select c1.* into c
  from public.conduct_policy_categories c1
  left join public.conduct_policy_groups g on g.id=c1.group_id
  join public.schools s on s.id=c1.school_id
  where c1.id=p_category_id
    and c1.school_id=p_school_id
    and c1.domain=p_domain
    and c1.active
    and (c1.group_id is null or g.active)
    and s.status='active'
  for share of c1;

  if not found then
    raise exception 'Category is not active in this school and domain';
  end if;

  if cardinality(v_learners)>1 then
    v_group:=gen_random_uuid();
  end if;

  foreach v_learner in array v_learners loop
    if not app_private.can_access_learner_observations(p_school_id,v_learner) then
      raise exception 'Learner is outside your conduct scope' using errcode='42501';
    end if;

    select e.id into v_enrolment
    from public.enrolments e
    where e.tenant_id=c.tenant_id
      and e.school_id=p_school_id
      and e.learner_id=v_learner
      and e.enrolled_from<=p_date
      and (e.enrolled_to is null or e.enrolled_to>=p_date)
    order by e.enrolled_from desc,e.id
    limit 1;

    if v_enrolment is null then
      raise exception 'Learner is not enrolled in this school on the event date';
    end if;

    if p_domain='conduct' then
      insert into public.conduct_events(
        tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,
        category_id,severity,summary,details,recorded_by_user_id,event_group_id
      ) values (
        c.tenant_id,p_school_id,v_learner,v_enrolment,p_date,c.direction,c.code,c.id,
        case when c.direction='positive' then 'routine' else coalesce(p_severity,c.default_severity,'routine') end,
        btrim(p_title),nullif(btrim(p_details),''),(select auth.uid()),v_group
      ) returning id into v_id;
    else
      insert into public.achievement_events(
        tenant_id,school_id,learner_id,enrolment_id,achieved_on,category_code,category_id,
        title,description,level,recorded_by_user_id,event_group_id
      ) values (
        c.tenant_id,p_school_id,v_learner,v_enrolment,p_date,c.code,c.id,btrim(p_title),
        nullif(btrim(p_details),''),p_level,(select auth.uid()),v_group
      ) returning id into v_id;
    end if;

    v_ids:=array_append(v_ids,v_id);
    insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id)
    values(c.tenant_id,p_school_id,(select auth.uid()),p_domain||'.recorded',p_domain||'_event',v_id);
  end loop;

  return v_ids;
end;
$$;

revoke all on function app_private.record_conduct_group(uuid,uuid,text,date,text,text,text,text,uuid[])
from public,anon,authenticated;
