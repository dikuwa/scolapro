-- Issue #634: keep finance learner lookup bounded and finance-authorized.
--
-- The finance page must not enumerate the whole school learner directory just
-- to populate an optional payment selector. Search remains current/effective
-- enrolment scoped, while recent payment labels are limited to the latest
-- payment rows already visible in the finance workspace.

create or replace function public.search_finance_learners(
  p_school_id uuid,
  p_query text default null,
  p_limit integer default 20
)
returns table(
  learner_id uuid,
  display_name text,
  admission_number text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20);
  v_query text := nullif(lower(btrim(coalesce(p_query, ''))), '');
  v_today date := (now() at time zone 'Africa/Windhoek')::date;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.can_manage_finance(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    l.id,
    btrim(coalesce(nullif(btrim(l.preferred_name), ''), btrim(l.first_names)) || ' ' || btrim(l.surname)),
    e.admission_number
  from public.enrolments e
  join public.learners l on l.id = e.learner_id
  where e.school_id = p_school_id
    and exists (
      select 1
      from public.schools s
      where s.id = p_school_id
        and e.tenant_id = s.tenant_id
        and l.tenant_id = s.tenant_id
    )
    and e.status = 'current'
    and e.enrolled_from <= v_today
    and (e.enrolled_to is null or e.enrolled_to >= v_today)
    and (
      v_query is null
      or concat_ws(' ', l.first_names, l.surname, l.preferred_name, e.admission_number)
        ilike '%' || v_query || '%'
    )
  order by lower(l.surname), lower(l.first_names), e.admission_number, e.id
  limit v_limit;
end;
$$;

revoke all on function public.search_finance_learners(uuid, text, integer) from public, anon;
grant execute on function public.search_finance_learners(uuid, text, integer) to authenticated;

comment on function public.search_finance_learners(uuid, text, integer) is
'Finance-authorized current/effective learner lookup bounded to 20 results and searchable by learner identity or admission number.';

create or replace function public.get_finance_payment_learner_labels(
  p_school_id uuid,
  p_learner_ids uuid[] default '{}'::uuid[]
)
returns table(
  learner_id uuid,
  display_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not app_private.can_manage_finance(p_school_id) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    l.id,
    btrim(coalesce(nullif(btrim(l.preferred_name), ''), btrim(l.first_names)) || ' ' || btrim(l.surname))
  from public.learners l
  where l.id = any(coalesce(p_learner_ids, '{}'::uuid[]))
    and exists (
      select 1
      from (
        select fp.learner_id
        from public.finance_payments fp
        join public.schools s on s.id = fp.school_id
        where fp.school_id = p_school_id
          and fp.tenant_id = s.tenant_id
          and fp.learner_id is not null
        order by fp.paid_on desc, fp.created_at desc, fp.id desc
        limit 50
      ) recent
      where recent.learner_id = l.id
    )
    and exists (
      select 1
      from public.schools s
      where s.id = p_school_id
        and l.tenant_id = s.tenant_id
    )
  order by lower(l.surname), lower(l.first_names), l.id;
end;
$$;

revoke all on function public.get_finance_payment_learner_labels(uuid, uuid[]) from public, anon;
grant execute on function public.get_finance_payment_learner_labels(uuid, uuid[]) to authenticated;

comment on function public.get_finance_payment_learner_labels(uuid, uuid[]) is
'Returns labels only for learner IDs present in the latest 50 finance payments for a finance-authorized school.';
