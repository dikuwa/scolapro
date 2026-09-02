-- Date-level readiness treats today's state as the end-of-day/current truth. Using
-- transaction-stable now() audit timestamps alone cannot order multiple same-transaction
-- register/withdraw/reactivate events, so current-date reads use the authoritative row
-- lifecycle while historical dates continue to reconstruct from immutable audit events.
create or replace function app_private.subject_registration_is_active_at(
  p_registration_id uuid,
  p_reference_date date
)
returns boolean
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare
  v_event_type text;
  v_registration public.learner_subject_registrations%rowtype;
begin
  if p_registration_id is null or p_reference_date is null then
    return false;
  end if;

  select * into v_registration
  from public.learner_subject_registrations r
  where r.id=p_registration_id;
  if not found then return false; end if;

  if p_reference_date>=current_date then
    return v_registration.registered_at::date<=p_reference_date
      and v_registration.status='active';
  end if;

  select ae.event_type into v_event_type
  from public.audit_events ae
  where ae.entity_type='learner_subject_registration'
    and ae.entity_id=p_registration_id
    and ae.event_type in (
      'learner_subject_registration.registered',
      'learner_subject_registration.reactivated',
      'learner_subject_registration.withdrawn'
    )
    and ae.occurred_at::date<=p_reference_date
  order by ae.occurred_at desc,ae.id desc
  limit 1;

  if v_event_type is not null then
    return v_event_type in (
      'learner_subject_registration.registered',
      'learner_subject_registration.reactivated'
    );
  end if;

  return v_registration.registered_at::date<=p_reference_date
    and (
      v_registration.status='active'
      or v_registration.withdrawn_at is null
      or v_registration.withdrawn_at::date>p_reference_date
    );
end;
$$;

revoke all on function app_private.subject_registration_is_active_at(uuid,date)
from public,anon,authenticated;

-- Use integer at the public JSON/RPC boundary, matching the rest of the report-card
-- read models, while retaining smallint inside the constrained academic data model.
drop function if exists public.get_learner_subject_result_readiness(uuid,smallint);

create or replace function public.get_learner_subject_result_readiness(
  p_enrolment_id uuid,
  p_term_number integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,app_private
as $$
declare
  v_school_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_term_number is null or p_term_number<1 or p_term_number>6 then
    raise exception 'Term number is invalid';
  end if;

  select e.school_id into v_school_id
  from public.enrolments e
  where e.id=p_enrolment_id;
  if v_school_id is null then raise exception 'Enrolment not found'; end if;

  if not app_private.can_read_learner_subject_result_readiness(v_school_id) then
    raise exception 'Permission denied';
  end if;

  return app_private.build_learner_subject_result_readiness(
    p_enrolment_id,p_term_number::smallint
  );
end;
$$;

revoke all on function public.get_learner_subject_result_readiness(uuid,integer)
from public,anon;
grant execute on function public.get_learner_subject_result_readiness(uuid,integer)
to authenticated;

comment on function app_private.subject_registration_is_active_at(uuid,date) is
  'Resolves date-level subject-registration lifecycle. Today/future-capped reads use authoritative current row state; historical dates use immutable audit-event history with row fallback, avoiding ambiguity from multiple transaction-stable timestamps on the same date.';
comment on function public.get_learner_subject_result_readiness(uuid,integer) is
  'Academic-leadership readiness view for reconciling learner subject choices with official term results before subject-registration completeness is enforced against report-card generation or certification.';