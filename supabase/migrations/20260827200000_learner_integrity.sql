-- Learner identity and enrolment integrity rules for the first vertical slice.
-- Keep identifiers nullable because not every learner will have every document,
-- but reject duplicate identifiers when a value is present.

create unique index if not exists learners_tenant_national_id_uidx
  on public.learners (tenant_id, lower(btrim(national_id)))
  where national_id is not null and btrim(national_id) <> '';

create unique index if not exists learners_tenant_birth_certificate_uidx
  on public.learners (tenant_id, lower(btrim(birth_certificate_number)))
  where birth_certificate_number is not null and btrim(birth_certificate_number) <> '';

create unique index if not exists enrolments_school_year_admission_number_uidx
  on public.enrolments (school_id, academic_year, lower(btrim(admission_number)))
  where admission_number is not null and btrim(admission_number) <> '';

-- A learner may have historical enrolments in more than one school in the same
-- year after a transfer, but only one enrolment may be current at a time.
create unique index if not exists enrolments_one_current_per_learner_year_uidx
  on public.enrolments (learner_id, academic_year)
  where status = 'current';

-- Prevent impossible blank identifiers from being stored as meaningful values.
alter table public.learners
  add constraint learners_national_id_not_blank
  check (national_id is null or btrim(national_id) <> '') not valid;

alter table public.learners
  add constraint learners_birth_certificate_not_blank
  check (birth_certificate_number is null or btrim(birth_certificate_number) <> '') not valid;

alter table public.enrolments
  add constraint enrolments_admission_number_not_blank
  check (admission_number is null or btrim(admission_number) <> '') not valid;

comment on index public.learners_tenant_national_id_uidx is
  'Prevents duplicate learner national IDs within a tenant while allowing unknown IDs.';

comment on index public.enrolments_one_current_per_learner_year_uidx is
  'Allows same-year transfer history while preventing two simultaneous current enrolments for one learner.';
