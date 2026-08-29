-- The CRC contains ordinary longitudinal history alongside material that has the
-- same sensitivity as counselling/support records. Do not grant psychological or
-- highly restricted health access through generic learner-profile or admin rights.

create or replace function app_private.can_access_sensitive_crc(
  p_school_id uuid,
  p_sensitivity text
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select case
    when p_sensitivity='highly_restricted' then
      app_private.has_explicit_support_role(p_school_id)
    when p_sensitivity='restricted' then
      app_private.can_manage_learner_support(p_school_id)
    else false
  end;
$$;

revoke all on function app_private.can_access_sensitive_crc(uuid,text) from public,anon,authenticated;

drop policy if exists "restricted staff read health history" on public.learner_health_history;
drop policy if exists "restricted staff manage health history" on public.learner_health_history;
create policy "need to know staff read health history"
on public.learner_health_history for select to authenticated
using (app_private.can_access_sensitive_crc(school_id,sensitivity));
create policy "need to know staff manage health history"
on public.learner_health_history for all to authenticated
using (app_private.can_access_sensitive_crc(school_id,sensitivity))
with check (
  app_private.can_access_sensitive_crc(school_id,sensitivity)
  and recorded_by_user_id=(select auth.uid())
);

drop policy if exists "restricted staff read psychometric records" on public.learner_psychometric_records;
drop policy if exists "restricted staff manage psychometric records" on public.learner_psychometric_records;
create policy "need to know staff read psychometric records"
on public.learner_psychometric_records for select to authenticated
using (app_private.can_access_sensitive_crc(school_id,sensitivity));
create policy "need to know staff manage psychometric records"
on public.learner_psychometric_records for all to authenticated
using (app_private.can_access_sensitive_crc(school_id,sensitivity))
with check (
  app_private.can_access_sensitive_crc(school_id,sensitivity)
  and recorded_by_user_id=(select auth.uid())
);

-- Sensitive historical records should not disappear through routine client DML.
revoke delete on public.learner_health_history from authenticated;
revoke delete on public.learner_psychometric_records from authenticated;

comment on function app_private.can_access_sensitive_crc(uuid,text) is
'Sensitivity-aware CRC boundary: restricted records permit support leadership; highly restricted records require an explicit counsellor/learner-support role.';
