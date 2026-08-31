-- Add a bounded guardian directory API without changing the existing search
-- contract used elsewhere. Permission-aware learner links remain the source of
-- guardian visibility; paging happens only after that authorization filter.

create or replace function public.search_guardian_directory_page(
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
language sql
stable
security definer
set search_path=public,app_private
as $$
  with authorized_links as (
    select distinct
      lg.guardian_id,
      lg.learner_id,
      lg.relationship_type,
      lg.is_legal_guardian,
      lg.is_emergency_contact,
      lg.is_pickup_authorized,
      lg.priority,
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
      and (e.enrolled_to is null or e.enrolled_to>=current_date)
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
      and (
        app_private.can_access_learner_observations(e.school_id,e.learner_id)
        or exists(
          select 1
          from public.school_memberships sm
          where sm.school_id=e.school_id
            and sm.user_id=(select auth.uid())
            and sm.role_key='hod'
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
        )
      )
  ), guardian_rows as (
    select
      gp.id guardian_id,
      trim(concat(gp.first_names,' ',gp.surname)) guardian_name,
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
      ) primary_mobile,
      (
        select gc.contact_value
        from public.guardian_contacts gc
        where gc.guardian_id=gp.id
          and gc.contact_type='email'
          and gc.effective_from<=current_date
          and (gc.effective_to is null or gc.effective_to>=current_date)
        order by gc.is_primary desc,gc.created_at desc
        limit 1
      ) primary_email,
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
      ) linked_learners
    from authorized_links al
    join public.guardian_profiles gp on gp.id=al.guardian_id
    where gp.status='active'
      and (
        nullif(btrim(coalesce(p_query,'')),'') is null
        or trim(concat(gp.first_names,' ',gp.surname)) ilike '%'||btrim(p_query)||'%'
        or exists(
          select 1 from public.guardian_contacts gc
          where gc.guardian_id=gp.id
            and gc.effective_from<=current_date
            and (gc.effective_to is null or gc.effective_to>=current_date)
            and gc.contact_value ilike '%'||btrim(p_query)||'%'
        )
        or exists(
          select 1 from authorized_links sal
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
$$;

revoke all on function public.search_guardian_directory_page(uuid,text,integer,integer) from public,anon;
grant execute on function public.search_guardian_directory_page(uuid,text,integer,integer) to authenticated;

comment on function public.search_guardian_directory_page(uuid,text,integer,integer) is
'Permission-aware paged guardian directory. Guardian/learner search executes before a bounded page is returned; existing search_guardian_directory remains backward compatible.';
