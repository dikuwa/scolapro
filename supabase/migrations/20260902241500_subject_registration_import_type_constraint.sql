alter table public.import_batches
  drop constraint if exists import_batches_import_type_check;

alter table public.import_batches
  add constraint import_batches_import_type_check
  check (import_type in ('learners','staff','guardians','academic_structure','subject_registrations'));

comment on constraint import_batches_import_type_check on public.import_batches is
  'Supported source-preserving import domains, including governed learner subject-registration imports.';
