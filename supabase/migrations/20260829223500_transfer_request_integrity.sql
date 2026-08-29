-- Requested transfers must be internally coherent before they enter approval.
-- Prevent parallel open transfers for the same source enrolment and ensure the
-- learner/school/tenant provenance matches that enrolment at the table boundary.

create unique index if not exists transfer_events_one_open_per_source_enrolment_uidx
  on public.transfer_events(source_enrolment_id)
  where status in ('requested','approved');

create or replace function app_private.guard_transfer_request_integrity()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_school public.schools%rowtype;
begin
  select * into v_enrolment from public.enrolments where id=new.source_enrolment_id;
  if not found then raise exception 'Transfer source enrolment does not exist'; end if;
  if v_enrolment.learner_id<>new.learner_id then raise exception 'Transfer learner does not match source enrolment'; end if;
  if v_enrolment.school_id<>new.source_school_id then raise exception 'Transfer source school does not match source enrolment'; end if;
  if v_enrolment.tenant_id<>new.tenant_id then raise exception 'Transfer tenant does not match source enrolment'; end if;
  if new.status in ('requested','approved') and v_enrolment.status<>'current' then
    raise exception 'Open transfer requires a current source enrolment';
  end if;
  if new.destination_school_id is not null then
    select * into v_school from public.schools where id=new.destination_school_id;
    if not found then raise exception 'Transfer destination school does not exist'; end if;
    if v_school.tenant_id<>new.tenant_id then raise exception 'Internal transfer destination must belong to the same tenant'; end if;
    if new.destination_school_id=new.source_school_id then raise exception 'Transfer destination must differ from source school'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists transfer_request_integrity_guard on public.transfer_events;
create trigger transfer_request_integrity_guard
before insert or update of tenant_id,learner_id,source_school_id,source_enrolment_id,destination_school_id,status
on public.transfer_events
for each row execute function app_private.guard_transfer_request_integrity();

comment on index transfer_events_one_open_per_source_enrolment_uidx is 'At most one requested/approved transfer may be active for a source enrolment.';