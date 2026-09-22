-- Issue #649: guardian directory page used learner-scoped authority checks per
-- linked learner even when the actor already had school-wide guardian-directory
-- authority. Resolve that authority once and only invoke learner-scoped checks
-- for actors that actually need them.

create or replace function public.search_guardian_directory_page_current_enrolment_impl(
  p_school_id uuid,
  p_query text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  guardian_id uuid,
  guardian_name text,
  primary_mobile text,
  primary_email text,
  linked_learners jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public','app_private'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.has_school_access(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  with actor_scope as materialized (
    select
      app_private.has_platform_role(array['platform_admin'])
      or exists(
        select 1
        from public.school_memberships sm
        where sm.school_id=p_school_id
          and sm.user_id=(select auth.uid())
          and sm.role_key in ('school_admin','principal','deputy_principal','counsellor','hod')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
      ) as schoolwide
  ),
  base_links as materialized (
    select distinct
      lg.guardian_id,
      lg.learner_id,
      lg.relationship_type,
      lg.is_legal_guardian,
      lg.is_emergency_contact,
      lg.is_pickup_authorized,
      lg.priority,
      e.school_id,
      e.admission_number,
      l.first_names learner_first_names,
      l.surname learner_surname,
      g.display_name grade_name,
      rc.display_name class_name
    from public.learner_guardians lg
    join public.learners l on l.id=lg.learner_id
    join public.enrolments e on e.learner_id=lg.learner_id
    left join public.grades g on g.id=e.grade_id
    left join public.register_classes rc on rc.id=e.register_class_id
    where e.school_id=p_school_id
      and e.status='current'
      and e.enrolled_from<=current_date
      and (e.enrolled_to is null or e.enrolled_to>=current_date)
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
  ),
  authorized_links as materialized (
    select bl.*
    from base_links bl
    cross join actor_scope actor
    where actor.schoolwide

    union all

    select bl.*
    from base_links bl
    cross join actor_scope actor
    where not actor.schoolwide
      and app_private.can_access_learner_observations(bl.school_id,bl.learner_id)
  ),
  guardian_rows as (
    select
      gp.id as guardian_id,
      trim(concat(gp.first_names,' ',gp.surname)) as guardian_name,
      (
        select gc.contact_value
        from public.guardian_contacts gc
        where gc.guardian_id=gp.id
          and gc.contact_type in ('mobile','phone','whatsapp')
          and gc.effective_from<=current_date
          and (gc.effective_to is null or gc.effective_to>=current_date)
        order by gc.is_primary desc,
          case gc.contact_type when 'mobile' then 1 when 'phone' then 2 else 3 end,
          gc.created_at desc
        limit 1
      ) as primary_mobile,
      (
        select gc.contact_value
        from public.guardian_contacts gc
        where gc.guardian_id=gp.id
          and gc.contact_type='email'
          and gc.effective_from<=current_date
          and (gc.effective_to is null or gc.effective_to>=current_date)
        order by gc.is_primary desc,gc.created_at desc
        limit 1
      ) as primary_email,
      jsonb_agg(
        jsonb_build_object(
          'learner_id',al.learner_id,
          'learner_name',trim(concat(al.learner_first_names,' ',al.learner_surname)),
          'admission_number',al.admission_number,
          'grade_name',al.grade_name,
          'class_name',al.class_name,
          'relationship_type',al.relationship_type,
          'is_legal_guardian',al.is_legal_guardian,
          'is_emergency_contact',al.is_emergency_contact,
          'is_pickup_authorized',al.is_pickup_authorized,
          'priority',al.priority
        )
        order by al.learner_surname,al.learner_first_names
      ) as linked_learners
    from authorized_links al
    join public.guardian_profiles gp on gp.id=al.guardian_id
    where gp.status='active'
      and (
        nullif(btrim(coalesce(p_query,'')),'') is null
        or trim(concat(gp.first_names,' ',gp.surname)) ilike '%'||btrim(p_query)||'%'
        or exists(
          select 1
          from public.guardian_contacts gc
          where gc.guardian_id=gp.id
            and gc.effective_from<=current_date
            and (gc.effective_to is null or gc.effective_to>=current_date)
            and gc.contact_value ilike '%'||btrim(p_query)||'%'
        )
        or exists(
          select 1
          from authorized_links sal
          where sal.guardian_id=gp.id
            and (
              trim(concat(sal.learner_first_names,' ',sal.learner_surname)) ilike '%'||btrim(p_query)||'%'
              or coalesce(sal.admission_number,'') ilike '%'||btrim(p_query)||'%'
              or coalesce(sal.grade_name,'') ilike '%'||btrim(p_query)||'%'
              or coalesce(sal.class_name,'') ilike '%'||btrim(p_query)||'%'
            )
        )
      )
    group by gp.id,gp.first_names,gp.surname
  )
  select
    gr.guardian_id,
    gr.guardian_name,
    gr.primary_mobile,
    gr.primary_email,
    gr.linked_learners,
    count(*) over() as total_count
  from guardian_rows gr
  order by gr.guardian_name,gr.guardian_id
  limit least(greatest(coalesce(p_page_size,50),1),100)
  offset (greatest(coalesce(p_page,1),1)-1)*least(greatest(coalesce(p_page_size,50),1),100);
end;
$function$;

comment on function public.search_guardian_directory_page_current_enrolment_impl(uuid,text,integer,integer) is
'Guardian directory page implementation with one school-wide authority resolution per request and learner-scoped fallback only when required.';
