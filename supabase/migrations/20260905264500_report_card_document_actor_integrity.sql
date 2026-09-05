-- Bind canonical report-card artifact metadata to the authorized manager who
-- requested generation. The service render worker may persist the artifact, but
-- it may not manufacture, omit, or later rewrite its human provenance.

create or replace function app_private.enforce_report_card_document_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'UPDATE' then
    if new.generated_by_user_id is distinct from old.generated_by_user_id
       or new.generated_at is distinct from old.generated_at
       or new.created_at is distinct from old.created_at then
      raise exception 'Report-card document generation provenance is immutable';
    end if;
    return new;
  end if;

  if new.generated_by_user_id is null then
    raise exception 'Report-card document generator is required';
  end if;

  if auth.uid() is not null
     and new.generated_by_user_id is distinct from auth.uid() then
    raise exception 'Report-card document generator must match authenticated actor';
  end if;

  if not app_private.user_can_manage_report_cards(new.generated_by_user_id,new.school_id) then
    raise exception 'Report-card document generator is not authorized for school';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_report_card_document_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_report_card_document_actor_integrity() is
'Requires durable report-card artifact metadata to carry an authorized report-manager generator and freezes that provenance after creation.';

-- Existing scope/certification integrity remains the first validation boundary.
drop trigger if exists zz_report_card_document_actor_integrity_trg on public.report_card_documents;
create trigger zz_report_card_document_actor_integrity_trg
before insert or update
on public.report_card_documents
for each row execute function app_private.enforce_report_card_document_actor_integrity();
