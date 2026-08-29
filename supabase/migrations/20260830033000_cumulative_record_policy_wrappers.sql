-- RLS policies run in the authenticated caller context and therefore must only call
-- helper functions that are safe to expose as narrow boolean authorization checks.
-- Keep the broader internal observation helper private and expose CRC-specific wrappers.

create or replace function app_private.can_access_crc_observation(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.can_access_learner_observations(p_school_id,p_learner_id);
$$;

revoke all on function app_private.can_access_crc_observation(uuid,uuid) from public,anon;
grant execute on function app_private.can_access_crc_observation(uuid,uuid) to authenticated;

grant execute on function app_private.can_access_sensitive_crc(uuid,text) to authenticated;

drop policy if exists "assigned staff read prior school history" on public.learner_prior_school_history;
create policy "assigned staff read prior school history"
on public.learner_prior_school_history for select to authenticated
using (app_private.can_access_crc_observation(school_id,learner_id));

drop policy if exists "assigned staff read development observations" on public.learner_development_observations;
create policy "assigned staff read development observations"
on public.learner_development_observations for select to authenticated
using (app_private.can_access_crc_observation(school_id,learner_id));

drop policy if exists "assigned staff create development observations" on public.learner_development_observations;
create policy "assigned staff create development observations"
on public.learner_development_observations for insert to authenticated
with check (
  app_private.can_access_crc_observation(school_id,learner_id)
  and recorded_by_user_id=(select auth.uid())
);

drop policy if exists "authorized staff read cumulative notes" on public.learner_cumulative_notes;
create policy "authorized staff read cumulative notes"
on public.learner_cumulative_notes for select to authenticated
using (
  case when sensitivity='routine'
    then app_private.can_access_crc_observation(school_id,learner_id)
    else app_private.can_manage_learner_support(school_id)
  end
);

drop policy if exists "authorized staff create cumulative notes" on public.learner_cumulative_notes;
create policy "authorized staff create cumulative notes"
on public.learner_cumulative_notes for insert to authenticated
with check (
  recorded_by_user_id=(select auth.uid())
  and (
    (sensitivity='routine' and app_private.can_access_crc_observation(school_id,learner_id))
    or (sensitivity<>'routine' and app_private.can_manage_learner_support(school_id))
  )
);

comment on function app_private.can_access_crc_observation(uuid,uuid) is
'Narrow RLS-facing CRC authorization wrapper. It exposes only whether the current authenticated user may see routine longitudinal observations for one learner.';
