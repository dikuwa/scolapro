create or replace function public.list_learning_resource_learner_borrowers(p_school_id uuid)
returns table (
  learner_id uuid,
  admission_number text,
  grade_id uuid,
  register_class_id uuid,
  first_names text,
  surname text
)
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.can_manage_ltsm(p_school_id) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  return query
  select
    e.learner_id,
    e.admission_number,
    e.grade_id,
    e.register_class_id,
    l.first_names,
    l.surname
  from public.enrolments e
  join public.learners l
    on l.id = e.learner_id
   and l.tenant_id = e.tenant_id
  where e.school_id = p_school_id
    and e.status = 'current'
    and e.enrolled_from <= current_date
    and (e.enrolled_to is null or e.enrolled_to >= current_date)
  order by l.surname, l.first_names, e.learner_id;
end;
$$;

revoke all on function public.list_learning_resource_learner_borrowers(uuid) from public, anon;
grant execute on function public.list_learning_resource_learner_borrowers(uuid) to authenticated;

comment on function public.list_learning_resource_learner_borrowers(uuid) is
  'Lists effective current learner borrowers only for the authenticated actor''s deterministic current-school LTSM scope.';
