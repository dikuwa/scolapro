-- Complete the lifecycle already represented by learner_voluntary_contributions.status.
-- Recording remains available to class teachers; verification/reversal is restricted to
-- school leadership so corrections stay explicit and auditable rather than becoming
-- direct table edits.

alter table public.learner_voluntary_contributions
  add column if not exists verified_by_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists verified_at timestamptz,
  add column if not exists reversed_by_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_note text;

create or replace function app_private.can_govern_voluntary_contributions(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal']);
$$;
revoke all on function app_private.can_govern_voluntary_contributions(uuid) from public,anon,authenticated;

create or replace function public.verify_learner_voluntary_contribution(p_contribution_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_record public.learner_voluntary_contributions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_record
  from public.learner_voluntary_contributions
  where id=p_contribution_id
  for update;

  if not found then raise exception 'Contribution record not found'; end if;
  if not app_private.can_govern_voluntary_contributions(v_record.school_id) then raise exception 'Permission denied'; end if;
  if v_record.status='reversed' then raise exception 'Reversed contribution cannot be verified'; end if;

  update public.learner_voluntary_contributions
  set status='verified',
      verified_by_user_id=auth.uid(),
      verified_at=coalesce(verified_at,now()),
      updated_at=now()
  where id=v_record.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_record.tenant_id,v_record.school_id,auth.uid(),
    'voluntary_contribution.verified','learner_voluntary_contribution',v_record.id,
    jsonb_build_object('learner_id',v_record.learner_id,'campaign_id',v_record.campaign_id,'item_id',v_record.item_id)
  );

  return true;
end;
$$;

create or replace function public.reverse_learner_voluntary_contribution(
  p_contribution_id uuid,
  p_reversal_note text
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_record public.learner_voluntary_contributions%rowtype;
  v_note text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  v_note:=nullif(btrim(coalesce(p_reversal_note,'')),'');
  if v_note is null then raise exception 'Reversal note is required'; end if;

  select * into v_record
  from public.learner_voluntary_contributions
  where id=p_contribution_id
  for update;

  if not found then raise exception 'Contribution record not found'; end if;
  if not app_private.can_govern_voluntary_contributions(v_record.school_id) then raise exception 'Permission denied'; end if;
  if v_record.status='reversed' then raise exception 'Contribution is already reversed'; end if;

  update public.learner_voluntary_contributions
  set status='reversed',
      reversed_by_user_id=auth.uid(),
      reversed_at=now(),
      reversal_note=v_note,
      updated_at=now()
  where id=v_record.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_record.tenant_id,v_record.school_id,auth.uid(),
    'voluntary_contribution.reversed','learner_voluntary_contribution',v_record.id,
    jsonb_build_object(
      'learner_id',v_record.learner_id,
      'campaign_id',v_record.campaign_id,
      'item_id',v_record.item_id,
      'previous_status',v_record.status,
      'reason',v_note
    )
  );

  return true;
end;
$$;

revoke all on function public.verify_learner_voluntary_contribution(uuid) from public,anon;
grant execute on function public.verify_learner_voluntary_contribution(uuid) to authenticated;
revoke all on function public.reverse_learner_voluntary_contribution(uuid,text) from public,anon;
grant execute on function public.reverse_learner_voluntary_contribution(uuid,text) to authenticated;

comment on function public.reverse_learner_voluntary_contribution(uuid,text) is
'Reverses a voluntary contribution with mandatory reason and audit provenance; it never creates learner debt or edits compulsory finance.';