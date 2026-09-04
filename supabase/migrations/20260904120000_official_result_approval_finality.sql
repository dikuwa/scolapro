create or replace function app_private.enforce_official_result_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school_tenant uuid;
  v_enrolment record;
  v_offering record;
begin
  if tg_op = 'DELETE' then
    raise exception 'Official result cannot be deleted; use governed correction workflow';
  end if;

  select tenant_id into v_school_tenant
  from public.schools
  where id = new.school_id;

  if v_school_tenant is null
     or new.tenant_id is distinct from v_school_tenant then
    raise exception 'Official result scope mismatch: school does not belong to tenant';
  end if;

  select tenant_id,school_id,academic_year,learner_id
    into v_enrolment
  from public.enrolments
  where id = new.enrolment_id;

  if not found
     or (new.tenant_id,new.school_id,new.academic_year,new.learner_id)
        is distinct from
        (v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.academic_year,v_enrolment.learner_id) then
    raise exception 'Official result scope mismatch: enrolment identity differs';
  end if;

  select tenant_id,school_id,academic_year
    into v_offering
  from public.subject_offerings
  where id = new.subject_offering_id;

  if not found
     or (new.tenant_id,new.school_id,new.academic_year)
        is distinct from
        (v_offering.tenant_id,v_offering.school_id,v_offering.academic_year) then
    raise exception 'Official result scope mismatch: subject offering differs';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null
       and new.approved_by_user_id is distinct from auth.uid() then
      raise exception 'Official result approver must match authenticated actor';
    end if;

    if not app_private.user_is_academic_leader(
      new.approved_by_user_id,
      new.school_id
    ) then
      raise exception 'Official result approver is not authorized for school';
    end if;

    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.academic_year is distinct from old.academic_year
     or new.enrolment_id is distinct from old.enrolment_id
     or new.learner_id is distinct from old.learner_id
     or new.subject_offering_id is distinct from old.subject_offering_id
     or new.term_number is distinct from old.term_number
     or new.result_value is distinct from old.result_value
     or new.result_status is distinct from old.result_status
     or new.symbol is distinct from old.symbol
     or new.assessment_scheme_key is distinct from old.assessment_scheme_key
     or new.assessment_scheme_version is distinct from old.assessment_scheme_version
     or new.academic_rule_set_key is distinct from old.academic_rule_set_key
     or new.academic_rule_set_version is distinct from old.academic_rule_set_version
     or new.calculation_snapshot is distinct from old.calculation_snapshot
     or new.approved_by_user_id is distinct from old.approved_by_user_id
     or new.approved_at is distinct from old.approved_at
     or new.locked_at is distinct from old.locked_at
     or new.grading_scale_key is distinct from old.grading_scale_key
     or new.grading_scale_version is distinct from old.grading_scale_version
     or new.created_at is distinct from old.created_at then
    raise exception 'Official result calculation and approval provenance are immutable';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_official_result_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_official_result_integrity() is
'Binds official-result school/enrolment/offering scope and approver authority at creation, keeps locked calculation and approval provenance immutable, forbids deletion, and leaves published_at available for a separate governed publication lifecycle.';

drop trigger if exists official_result_integrity_trg on public.official_results;
create trigger official_result_integrity_trg
before insert or update or delete on public.official_results
for each row execute function app_private.enforce_official_result_integrity();
