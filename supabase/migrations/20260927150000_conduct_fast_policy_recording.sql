-- Conduct Policy Slice 3: canonical fast recording wrapper.
-- The selected active policy item supplies the event title and governed defaults.

create function public.record_conduct_policy_item_group(
  p_school_id uuid,
  p_category_id uuid,
  p_type text,
  p_date date,
  p_note text,
  p_learner_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  c public.conduct_policy_categories%rowtype;
  g public.conduct_policy_groups%rowtype;
begin
  if p_type not in ('recognition','violation') then
    raise exception 'Choose Recognition or Violation';
  end if;

  select c1.* into c
  from public.conduct_policy_categories c1
  where c1.id=p_category_id
    and c1.school_id=p_school_id
    and c1.domain='conduct'
    and c1.active
  for share;

  if not found or c.group_id is null then
    raise exception 'Conduct item is unavailable';
  end if;

  select g1.* into g
  from public.conduct_policy_groups g1
  where g1.id=c.group_id
    and g1.school_id=p_school_id
    and g1.active
  for share;

  if not found
    or g.type<>p_type
    or (p_type='recognition' and c.direction<>'positive')
    or (p_type='violation' and c.direction<>'negative') then
    raise exception 'Conduct item does not match the selected type';
  end if;

  return app_private.record_conduct_group(
    p_school_id,
    c.id,
    'conduct',
    p_date,
    c.display_name,
    coalesce(p_note,''),
    case when p_type='violation' then coalesce(c.default_severity,g.default_severity,'routine') else 'routine' end,
    null,
    p_learner_ids
  );
end;
$$;

revoke all on function public.record_conduct_policy_item_group(uuid,uuid,text,date,text,uuid[]) from public,anon;
grant execute on function public.record_conduct_policy_item_group(uuid,uuid,text,date,text,uuid[]) to authenticated;

comment on function public.record_conduct_policy_item_group(uuid,uuid,text,date,text,uuid[]) is
'Canonical fast Conduct recorder: learner(s) + Recognition/Violation + active policy item + optional note. Title/severity derive from school policy while existing event snapshot, scope, audit and grouping rules remain authoritative.';
