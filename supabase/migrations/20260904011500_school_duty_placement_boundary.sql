-- School-duty authorization must expire when the staff member is no longer
-- assigned to the school, even if a duty row itself remains open-ended.

create or replace function app_private.has_school_duty(
  p_school_id uuid,
  p_duty_key text,
  p_on_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select p_school_id is not null
    and nullif(btrim(coalesce(p_duty_key,'')),'') is not null
    and p_on_date is not null
    and exists (
      select 1
      from public.school_duty_assignments d
      join public.staff_members sm on sm.id=d.staff_member_id
      where d.school_id=p_school_id
        and d.duty_key=p_duty_key
        and d.active_from<=p_on_date
        and (d.active_to is null or d.active_to>=p_on_date)
        and sm.user_id=auth.uid()
        and sm.status='active'
        and app_private.staff_member_has_school_assignment(sm.id,p_school_id,p_on_date)
    );
$$;

revoke all on function app_private.has_school_duty(uuid,text,date) from public,anon;
grant execute on function app_private.has_school_duty(uuid,text,date) to authenticated;

comment on function app_private.has_school_duty(uuid,text,date) is
'Checks duty-based school authority for the authenticated staff account on a date, requiring both an effective duty assignment and an active school placement on that same date.';
