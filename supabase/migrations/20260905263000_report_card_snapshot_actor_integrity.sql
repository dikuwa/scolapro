-- Close the remaining provenance gap on canonical report-card snapshots.
-- Generation and certification actors are durable historical evidence and must
-- match real report-card management authority even for trusted/RLS-bypassing writes.

create or replace function app_private.enforce_report_card_snapshot_actor_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor uuid;
begin
  if tg_op = 'INSERT' then
    if new.generated_by_user_id is null then
      raise exception 'Report-card snapshot generator is required';
    end if;

    if auth.uid() is not null
       and new.generated_by_user_id is distinct from auth.uid() then
      raise exception 'Report-card snapshot generator must match authenticated actor';
    end if;

    if not app_private.user_can_manage_report_cards(new.generated_by_user_id,new.school_id) then
      raise exception 'Report-card snapshot generator is not authorized for school';
    end if;

    if new.status = 'draft' then
      if new.certified_by_user_id is not null or new.certified_at is not null then
        raise exception 'Draft report-card snapshot cannot carry certification provenance';
      end if;
    elsif new.status in ('certified','published','superseded') then
      if new.certified_by_user_id is null or new.certified_at is null then
        raise exception 'Certified report-card snapshot requires certification provenance';
      end if;
      if not app_private.user_can_manage_report_cards(new.certified_by_user_id,new.school_id) then
        raise exception 'Report-card snapshot certifier is not authorized for school';
      end if;
    end if;

    return new;
  end if;

  if new.generated_by_user_id is distinct from old.generated_by_user_id
     or new.generated_at is distinct from old.generated_at then
    raise exception 'Report-card snapshot generation provenance is immutable';
  end if;

  if old.certified_by_user_id is not null
     and new.certified_by_user_id is distinct from old.certified_by_user_id then
    raise exception 'Report-card snapshot certification actor is immutable';
  end if;
  if old.certified_at is not null
     and new.certified_at is distinct from old.certified_at then
    raise exception 'Report-card snapshot certification timestamp is immutable';
  end if;

  if old.status = 'draft' and new.status = 'published' then
    raise exception 'Draft report-card snapshot must be certified before publication';
  end if;

  if old.status = 'draft' and new.status = 'certified' then
    if new.certified_by_user_id is null or new.certified_at is null then
      raise exception 'Report-card certification requires actor and timestamp';
    end if;

    if auth.uid() is not null
       and new.certified_by_user_id is distinct from auth.uid() then
      raise exception 'Report-card snapshot certifier must match authenticated actor';
    end if;

    v_actor := new.certified_by_user_id;
    if not app_private.user_can_manage_report_cards(v_actor,new.school_id) then
      raise exception 'Report-card snapshot certifier is not authorized for school';
    end if;
  elsif old.status = 'draft' then
    if new.certified_by_user_id is not null or new.certified_at is not null then
      raise exception 'Certification provenance may only be recorded during certification';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_report_card_snapshot_actor_integrity()
  from public, anon, authenticated;

comment on function app_private.enforce_report_card_snapshot_actor_integrity() is
'Binds report-card generation and certification evidence to authorized actors, prevents authenticated spoofing, freezes generation/certification provenance, and rejects draft-to-published lifecycle bypass.';

-- Existing snapshot immutability/publication guards run first alphabetically.
drop trigger if exists zz_report_card_snapshot_actor_integrity_trg on public.report_card_snapshots;
create trigger zz_report_card_snapshot_actor_integrity_trg
before insert or update
on public.report_card_snapshots
for each row execute function app_private.enforce_report_card_snapshot_actor_integrity();
