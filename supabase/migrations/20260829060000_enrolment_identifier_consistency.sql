-- Keep the long-lived school learner identifier authoritative even for legacy,
-- seeded or integration-created enrolments that bypass the canonical learner RPC.
-- Existing enrolment rows are backfilled when their admission number is
-- unambiguous; future enrolment inserts inherit or establish the stable number.

with ranked as (
  select
    e.tenant_id,
    e.school_id,
    e.learner_id,
    upper(btrim(e.admission_number)) as admission_number,
    row_number() over (
      partition by e.school_id,e.learner_id
      order by (e.status='current') desc,e.enrolled_from desc,e.created_at desc,e.id desc
    ) as rn
  from public.enrolments e
  where nullif(btrim(e.admission_number),'') is not null
), candidates as (
  select r.*,
    count(*) over (partition by r.admission_number) as candidate_admission_count
  from ranked r
  where r.rn=1
)
insert into public.school_learner_identifiers(
  tenant_id,school_id,learner_id,admission_number,source,assigned_by_user_id
)
select
  c.tenant_id,c.school_id,c.learner_id,c.admission_number,'reconciled',null
from candidates c
where c.candidate_admission_count=1
  and not exists (
    select 1 from public.school_learner_identifiers existing
    where existing.school_id=c.school_id and existing.learner_id=c.learner_id
  )
  and not exists (
    select 1 from public.school_learner_identifiers existing
    where upper(btrim(existing.admission_number))=c.admission_number
  )
on conflict do nothing;

-- Preserve an auditable signal for legacy rows that could not be reconciled
-- automatically because one admission number points at multiple learners.
with ranked as (
  select
    e.tenant_id,
    e.school_id,
    e.learner_id,
    upper(btrim(e.admission_number)) as admission_number,
    row_number() over (
      partition by e.school_id,e.learner_id
      order by (e.status='current') desc,e.enrolled_from desc,e.created_at desc,e.id desc
    ) as rn
  from public.enrolments e
  where nullif(btrim(e.admission_number),'') is not null
), candidates as (
  select r.*,
    count(*) over (partition by r.admission_number) as candidate_admission_count
  from ranked r
  where r.rn=1
)
insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
select distinct
  c.tenant_id,c.school_id,null,'learner.identifier_backfill.requires_review','learner',c.learner_id,
  jsonb_build_object('admission_number',c.admission_number,'reason','duplicate_admission_number')
from candidates c
where c.candidate_admission_count>1
  and not exists (
    select 1 from public.school_learner_identifiers existing
    where existing.school_id=c.school_id and existing.learner_id=c.learner_id
  );

create or replace function app_private.ensure_enrolment_school_identifier()
returns trigger
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_existing public.school_learner_identifiers%rowtype;
  v_school_tenant uuid;
  v_admission text;
begin
  select tenant_id into v_school_tenant from public.schools where id=new.school_id;
  if v_school_tenant is null or v_school_tenant<>new.tenant_id then
    raise exception 'Enrolment school and tenant are inconsistent';
  end if;

  select * into v_existing
  from public.school_learner_identifiers
  where school_id=new.school_id and learner_id=new.learner_id;

  if found then
    if nullif(btrim(coalesce(new.admission_number,'')),'') is null then
      new.admission_number := v_existing.admission_number;
    elsif upper(btrim(new.admission_number))<>upper(btrim(v_existing.admission_number)) then
      raise exception 'Enrolment admission number conflicts with stable school learner identifier';
    else
      new.admission_number := v_existing.admission_number;
    end if;
    return new;
  end if;

  v_admission := nullif(upper(btrim(coalesce(new.admission_number,''))), '');
  if v_admission is null then
    return new;
  end if;

  if exists(
    select 1 from public.school_learner_identifiers
    where upper(btrim(admission_number))=v_admission
  ) then
    raise exception 'Admission number is already assigned to another learner';
  end if;

  insert into public.school_learner_identifiers(
    tenant_id,school_id,learner_id,admission_number,source,assigned_by_user_id
  ) values(
    new.tenant_id,new.school_id,new.learner_id,v_admission,'reconciled',auth.uid()
  );
  new.admission_number := v_admission;
  return new;
end;
$$;

drop trigger if exists enrolment_school_identifier_consistency_trg on public.enrolments;
create trigger enrolment_school_identifier_consistency_trg
before insert on public.enrolments
for each row execute function app_private.ensure_enrolment_school_identifier();

revoke all on function app_private.ensure_enrolment_school_identifier() from public,anon,authenticated;

comment on function app_private.ensure_enrolment_school_identifier() is
'Ensures new enrolments inherit or establish the stable school learner admission number; conflicting identifiers are rejected.';
