-- #967: collapse navigation-attention authenticated context + queue count into one self-scoped RPC.
create or replace function public.get_my_navigation_attention(
  p_as_of_date date
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  with context_row as (
    select
      school_memberships,
      platform_memberships
    from public.get_my_user_context(p_as_of_date)
  ),
  current_school as (
    select
      (context_row.school_memberships -> 0 ->> 'school_id')::uuid as school_id
    from context_row
    where pg_catalog.jsonb_array_length(context_row.school_memberships) > 0
      and pg_catalog.jsonb_array_length(context_row.platform_memberships) = 0
  ),
  primary_role as (
    select membership ->> 'role_key' as role_key
    from context_row
    cross join lateral pg_catalog.jsonb_array_elements(context_row.school_memberships)
      with ordinality as memberships(membership, ordinal)
    join current_school
      on (membership ->> 'school_id')::uuid = current_school.school_id
    order by
      case membership ->> 'role_key'
        when 'school_admin' then 1
        when 'principal' then 2
        when 'deputy_principal' then 3
        when 'hod' then 4
        when 'counsellor' then 5
        when 'class_teacher' then 6
        when 'teacher' then 7
        when 'librarian' then 8
        when 'ltsm' then 9
        when 'learner_support' then 10
        when 'social_worker' then 11
        when 'exam_officer' then 12
        when 'emis_officer' then 13
        when 'board_member' then 14
        when 'learner' then 15
        else 2147483647
      end,
      memberships.ordinal
    limit 1
  ),
  pending_data_corrections as (
    select count(request.id)::integer as attention_count
    from public.profile_change_requests request
    cross join current_school
    cross join primary_role
    where primary_role.role_key in (
      'school_admin',
      'principal',
      'deputy_principal',
      'counsellor'
    )
      and request.school_id = current_school.school_id
      and request.status = 'pending'
  )
  select
    case
      when coalesce((select attention_count from pending_data_corrections), 0) > 0
        then pg_catalog.jsonb_build_object(
          'data_corrections',
          (select attention_count from pending_data_corrections)
        )
      else '{}'::jsonb
    end;
$$;

revoke all on function public.get_my_navigation_attention(date) from public, anon;
grant execute on function public.get_my_navigation_attention(date) to authenticated;

comment on function public.get_my_navigation_attention(date) is
  'Returns supplemental navigation attention for the authenticated caller in one self-scoped request. Current school and role semantics mirror getUserContext, while profile-change visibility remains governed by source RLS.';