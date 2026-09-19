-- Issue #554: close report-card publication/current-scope gaps without changing
-- the established snapshot/certification/publication model. School managers must be
-- authorized for their deterministic current school and, when membership is linked to
-- a staff record, that staff placement must still cover the school today.

create or replace function app_private.user_can_manage_report_cards(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.role_key='platform_admin'
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    or (
      app_private.user_targets_current_school(p_user_id,p_school_id)
      and exists(
        select 1
        from public.school_memberships sm
        where sm.user_id=p_user_id
          and sm.school_id=p_school_id
          and sm.role_key in ('school_admin','principal','deputy_principal')
          and sm.active_from<=current_date
          and (sm.active_to is null or sm.active_to>=current_date)
          and (
            sm.staff_member_id is null
            or app_private.staff_member_covers_school_period(
              sm.staff_member_id,
              p_school_id,
              current_date,
              current_date
            )
          )
      )
    );
$$;

revoke all on function app_private.user_can_manage_report_cards(uuid,uuid)
from public,anon,authenticated;

comment on function app_private.user_can_manage_report_cards(uuid,uuid) is
'Current-school report-card management authority. Platform Admin retains governed platform scope; school managers require deterministic current school and any linked staff placement must remain effective. Platform Support is excluded.';

create or replace function app_private.enforce_report_card_publication_current_scope()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if old.status is distinct from 'published'
     and new.status='published'
     and (
       auth.uid() is null
       or not app_private.user_can_manage_report_cards(auth.uid(),new.school_id)
     )
  then
    raise exception 'Report-card publisher is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_report_card_publication_current_scope()
from public,anon,authenticated;

drop trigger if exists zy_report_card_publication_current_scope_trg
on public.report_card_snapshots;
create trigger zy_report_card_publication_current_scope_trg
before update on public.report_card_snapshots
for each row execute function app_private.enforce_report_card_publication_current_scope();

comment on function app_private.enforce_report_card_publication_current_scope() is
'Requires current report-card management authority at the exact certified-to-published transition, including worker impersonation of the recorded batch creator.';
