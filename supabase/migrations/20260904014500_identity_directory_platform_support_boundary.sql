-- Paged learner/staff directories expose school identity data (names plus
-- admission/employee identifiers). Generic Platform Support only has support-safe
-- metadata scope and must not gain identity enumeration through SECURITY DEFINER
-- directory RPCs. Require the stricter school identity/membership scope instead.

create or replace function public.list_learner_directory_page(
  p_school_id uuid,
  p_academic_year integer,
  p_query text default null,
  p_status text default 'current',
  p_grade_name text default null,
  p_class_name text default null,
  p_sex text default null,
  p_sort_desc boolean default false,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  enrolment_id uuid,
  learner_id uuid,
  first_names text,
  surname text,
  preferred_name text,
  admission_number text,
  grade_name text,
  class_name text,
  enrolment_status text,
  sex text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.has_school_membership_scope(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    e.id,
    l.id,
    l.first_names,
    l.surname,
    l.preferred_name,
    e.admission_number,
    coalesce(g.display_name, 'Unassigned'),
    coalesce(rc.display_name, 'Unassigned'),
    e.status::text,
    coalesce(l.sex::text, 'unspecified'),
    count(*) over()
  from public.enrolments e
  join public.learners l on l.id=e.learner_id
  left join public.grades g on g.id=e.grade_id
  left join public.register_classes rc on rc.id=e.register_class_id
  where e.school_id=p_school_id
    and e.academic_year=p_academic_year
    and (p_status is null or p_status='' or p_status='all' or e.status::text=p_status)
    and (p_grade_name is null or p_grade_name='' or g.display_name=p_grade_name)
    and (p_class_name is null or p_class_name='' or rc.display_name=p_class_name)
    and (p_sex is null or p_sex='' or p_sex='all' or coalesce(l.sex::text,'unspecified')=p_sex)
    and (
      v_query is null
      or concat_ws(' ',l.first_names,l.surname,l.preferred_name,e.admission_number,g.display_name,rc.display_name) ilike '%' || v_query || '%'
    )
  order by
    case when not p_sort_desc then lower(l.surname) end asc nulls last,
    case when not p_sort_desc then lower(l.first_names) end asc nulls last,
    case when p_sort_desc then lower(l.surname) end desc nulls last,
    case when p_sort_desc then lower(l.first_names) end desc nulls last,
    e.id
  limit v_page_size
  offset (v_page-1)*v_page_size;
end;
$$;

create or replace function public.list_staff_directory_page(
  p_school_id uuid,
  p_query text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table(
  row_id uuid,
  staff_id uuid,
  staff_name text,
  employee_number text,
  staff_code text,
  default_room_name text,
  labels text[],
  active_from date,
  active_to date,
  has_account boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_page integer := greatest(coalesce(p_page,1),1);
  v_page_size integer := least(greatest(coalesce(p_page_size,50),1),100);
  v_query text := nullif(btrim(coalesce(p_query,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_school_membership_scope(p_school_id) then raise exception 'Permission denied'; end if;

  return query
  with latest_assignment as (
    select distinct on (ssa.staff_member_id)
      ssa.id, ssa.staff_member_id, ssa.assignment_type, ssa.position_title,
      ssa.effective_from, ssa.effective_to, ssa.staff_code, ssa.default_room_id
    from public.staff_school_assignments ssa
    where ssa.school_id=p_school_id
    order by ssa.staff_member_id, ssa.effective_from desc, ssa.created_at desc, ssa.id
  ),
  membership_rollup as (
    select
      sm.staff_member_id,
      (array_agg(sm.id order by sm.active_from,sm.id))[1] as first_membership_id,
      min(sm.active_from) as first_active_from,
      case when bool_or(sm.active_to is null) then null else max(sm.active_to) end as last_active_to,
      bool_or(sm.user_id is not null) as has_account,
      array_agg(distinct sm.role_key::text order by sm.role_key::text) as role_labels
    from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id is not null
    group by sm.staff_member_id
  ),
  linked_staff_ids as (
    select staff_member_id from latest_assignment
    union
    select staff_member_id from membership_rollup
  ),
  linked_rows as (
    select
      coalesce(la.id,mr.first_membership_id) as row_id,
      ids.staff_member_id as staff_id,
      concat_ws(' ',staff.first_name,staff.last_name) as staff_name,
      staff.employee_number,
      la.staff_code,
      room.display_name as default_room_name,
      array_remove(array_cat(
        case when la.id is null then array[]::text[] else array[coalesce(nullif(btrim(la.position_title),''),la.assignment_type::text)] end,
        coalesce(mr.role_labels,array[]::text[])
      ),null) as labels,
      case
        when la.effective_from is null then mr.first_active_from
        when mr.first_active_from is null then la.effective_from
        else least(la.effective_from,mr.first_active_from)
      end as active_from,
      case
        when la.id is not null and la.effective_to is null then null
        when mr.staff_member_id is not null and mr.last_active_to is null then null
        else greatest(la.effective_to,mr.last_active_to)
      end as active_to,
      coalesce(mr.has_account,false) as has_account
    from linked_staff_ids ids
    join public.staff_members staff on staff.id=ids.staff_member_id
    left join latest_assignment la on la.staff_member_id=ids.staff_member_id
    left join membership_rollup mr on mr.staff_member_id=ids.staff_member_id
    left join public.school_rooms room on room.id=la.default_room_id
  ),
  unlinked_memberships as (
    select
      sm.id as row_id,
      null::uuid as staff_id,
      'Linked school user'::text as staff_name,
      null::text as employee_number,
      null::text as staff_code,
      null::text as default_room_name,
      array[sm.role_key::text] as labels,
      sm.active_from,
      sm.active_to,
      (sm.user_id is not null) as has_account
    from public.school_memberships sm
    where sm.school_id=p_school_id and sm.staff_member_id is null
  ),
  directory as (
    select * from linked_rows
    union all
    select * from unlinked_memberships
  ),
  filtered as (
    select d.*
    from directory d
    where v_query is null
       or concat_ws(' ',d.staff_name,d.employee_number,d.staff_code,d.default_room_name,array_to_string(d.labels,' ')) ilike '%' || v_query || '%'
  )
  select
    d.row_id,d.staff_id,d.staff_name,d.employee_number,d.staff_code,d.default_room_name,
    d.labels,d.active_from,d.active_to,d.has_account,count(*) over()
  from filtered d
  order by lower(d.staff_name),coalesce(d.employee_number,''),d.row_id
  limit v_page_size offset (v_page-1)*v_page_size;
end;
$$;

revoke all on function public.list_learner_directory_page(uuid,integer,text,text,text,text,text,boolean,integer,integer) from public,anon;
grant execute on function public.list_learner_directory_page(uuid,integer,text,text,text,text,text,boolean,integer,integer) to authenticated;
revoke all on function public.list_staff_directory_page(uuid,text,integer,integer) from public,anon;
grant execute on function public.list_staff_directory_page(uuid,text,integer,integer) to authenticated;

comment on function public.list_learner_directory_page(uuid,integer,text,text,text,text,text,boolean,integer,integer) is
'Paged learner identity directory requiring strict school identity/membership scope. Generic Platform Support metadata access is insufficient.';
comment on function public.list_staff_directory_page(uuid,text,integer,integer) is
'Paged staff identity directory requiring strict school identity/membership scope. Generic Platform Support metadata access is insufficient.';
