-- Duplicate employee numbers should be visible as staged row errors instead of
-- aborting the entire staging transaction. Keep the uniqueness guard for rows
-- that are otherwise eligible for reconciliation/commit.

drop index if exists public.import_rows_batch_employee_number_unique_idx;
create unique index import_rows_batch_employee_number_unique_idx
on public.import_rows(batch_id,upper(btrim(normalized_data->>'employee_number')))
where nullif(btrim(normalized_data->>'employee_number'),'') is not null
  and resolution <> 'error';

comment on index public.import_rows_batch_employee_number_unique_idx is
'Prevents more than one non-error row per employee number in a staged staff batch while allowing duplicate rows to remain visible as reviewable errors.';
