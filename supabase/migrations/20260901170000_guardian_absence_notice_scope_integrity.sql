create or replace function app_private.enforce_guardian_absence_notice_scope_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_tenant uuid;
  v_learner_tenant uuid;
  v_enrol public.enrolments%rowtype;
  v_guardian_tenant uuid;
begin
  if tg_op = 'UPDATE' and (
    new.tenant_id is distinct from old.tenant_id
    or new.school_id is distinct from old.school_id
    or new.learner_id is distinct from old.learner_id
    or new.enrolment_id is distinct from old.enrolment_id
    or new.guardian_id is distinct from old.guardian_id
    or new.submitted_by_user_id is distinct from old.submitted_by_user_id
  ) then
    raise exception 'Guardian absence notice tenant, school, learner, enrolment, guardian, and submitter are immutable';
  end if;

  select s.tenant_id into v_school_tenant
  from public.schools s
  where s.id = new.school_id;

  if v_school_tenant is null or v_school_tenant <> new.tenant_id then
    raise exception 'Guardian absence notice scope mismatch: school does not belong to tenant';
  end if;

  select l.tenant_id into v_learner_tenant
  from public.learners l
  where l.id = new.learner_id;

  if v_learner_tenant is null or v_learner_tenant <> new.tenant_id then
    raise exception 'Guardian absence notice scope mismatch: learner does not belong to tenant';
  end if;

  select * into v_enrol
  from public.enrolments e
  where e.id = new.enrolment_id;

  if not found
    or (v_enrol.tenant_id, v_enrol.school_id, v_enrol.learner_id)
       is distinct from (new.tenant_id, new.school_id, new.learner_id) then
    raise exception 'Guardian absence notice scope mismatch: enrolment does not match notice scope';
  end if;

  select g.tenant_id into v_guardian_tenant
  from public.guardian_profiles g
  where g.id = new.guardian_id;

  if v_guardian_tenant is null or v_guardian_tenant <> new.tenant_id then
    raise exception 'Guardian absence notice scope mismatch: guardian does not belong to tenant';
  end if;

  if not exists (
    select 1
    from public.learner_guardians lg
    where lg.tenant_id = new.tenant_id
      and lg.learner_id = new.learner_id
      and lg.guardian_id = new.guardian_id
  ) then
    raise exception 'Guardian absence notice scope mismatch: guardian is not linked to learner';
  end if;

  if not exists (
    select 1
    from public.guardian_user_links gul
    where gul.tenant_id = new.tenant_id
      and gul.guardian_id = new.guardian_id
      and gul.user_id = new.submitted_by_user_id
  ) then
    raise exception 'Guardian absence notice scope mismatch: submitter is not linked to guardian';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_guardian_absence_notice_scope_integrity() from public, anon, authenticated;

drop trigger if exists guardian_absence_notice_scope_integrity_trg on public.guardian_absence_notices;
create trigger guardian_absence_notice_scope_integrity_trg
before insert or update of tenant_id, school_id, learner_id, enrolment_id, guardian_id, submitted_by_user_id
on public.guardian_absence_notices
for each row execute function app_private.enforce_guardian_absence_notice_scope_integrity();