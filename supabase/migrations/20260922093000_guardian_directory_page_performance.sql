-- Issue #649: keep guardian directory authorization unchanged while moving
-- primary-contact hydration after pagination.
--
-- The previous implementation resolved mobile/email for every matching guardian
-- before applying LIMIT/OFFSET. The paged form now computes authorization,
-- filtering, learner links and total count first, then resolves contact previews
-- for the requested page only.

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
  grouped as materialized (
    select
      gp.id as guardian_id,
      trim(concat(gp.first_names,' ',gp.surname)) as guardian_name,
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
    group by gp.id,gp.first_names,gp.surname
  ),
  filtered as materialized (
    select gr.*
    from grouped gr
    where
      nullif(btrim(coalesce(p_query,'')),'') is null
      or gr.guardian_name ilike '%'||btrim(p_query)||'%'
      or exists(
        select 1
        from public.guardian_contacts gc
        where gc.guardian_id=gr.guardian_id
          and gc.effective_from<=current_date
          and (gc.effective_to is null or gc.effective_to>=current_date)
          and gc.contact_value ilike '%'||btrim(p_query)||'%'
      )
      or exists(
        select 1
        from jsonb_array_elements(gr.linked_learners) learner
        where coalesce(learner->>'learner_name','') ilike '%'||btrim(p_query)||'%'
           or coalesce(learner->>'admission_number','') ilike '%'||btrim(p_query)||'%'
           or coalesce(learner->>'grade_name','') ilike '%'||btrim(p_query)||'%'
           or coalesce(learner->>'class_name','') ilike '%'||btrim(p_query)||'%'
      )
  ),
  paged as materialized (
    select
      f.*,
      count(*) over() as total_count
    from filtered f
    order by f.guardian_name,f.guardian_id
    limit least(greatest(coalesce(p_page_size,50),1),100)
    offset (greatest(coalesce(p_page,1),1)-1)
      * least(greatest(coalesce(p_page_size,50),1),100)
  )
  select
    pg.guardian_id,
    pg.guardian_name,
    (
      select gc.contact_value
      from public.guardian_contacts gc
      where gc.guardian_id=pg.guardian_id
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
      where gc.guardian_id=pg.guardian_id
        and gc.contact_type='email'
        and gc.effective_from<=current_date
        and (gc.effective_to is null or gc.effective_to>=current_date)
      order by gc.is_primary desc,gc.created_at desc
      limit 1
    ) as primary_email,
    pg.linked_learners,
    pg.total_count
  from paged pg
  order by pg.guardian_name,pg.guardian_id;
end;
$function$;
