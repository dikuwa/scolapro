-- Guardian account claims must use the same current-contact semantics as the
-- guardian directory: a contact is active only after its effective start date
-- and until its optional effective end date.

create or replace function public.find_claimable_guardian_profiles()
returns table(guardian_id uuid, tenant_id uuid, display_name text)
language sql
stable
security definer
set search_path=public,auth
as $$
  select distinct gp.id,gp.tenant_id,btrim(gp.first_names||' '||gp.surname) as display_name
  from auth.users u
  join public.guardian_contacts gc on gc.contact_type='email'
    and gc.effective_from<=current_date
    and (gc.effective_to is null or gc.effective_to>=current_date)
    and lower(btrim(gc.contact_value))=lower(u.email)
  join public.guardian_profiles gp on gp.id=gc.guardian_id and gp.status='active'
  where u.id=auth.uid()
    and not exists(
      select 1
      from public.guardian_user_links gul
      where gul.user_id=u.id and gul.guardian_id=gp.id
    )
  order by 3;
$$;

create or replace function public.claim_guardian_profile(p_guardian_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,app_private,auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_guardian public.guardian_profiles%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select lower(email) into v_email from auth.users where id=v_user_id;
  if v_email is null or btrim(v_email)='' then
    raise exception 'Authenticated account has no email';
  end if;

  select * into v_guardian
  from public.guardian_profiles
  where id=p_guardian_id and status='active';
  if not found then raise exception 'Guardian not found or inactive'; end if;

  if not exists(
    select 1
    from public.guardian_contacts gc
    where gc.guardian_id=p_guardian_id
      and gc.contact_type='email'
      and gc.effective_from<=current_date
      and (gc.effective_to is null or gc.effective_to>=current_date)
      and lower(btrim(gc.contact_value))=v_email
  ) then
    raise exception 'Account email does not match an active guardian email';
  end if;

  insert into public.guardian_user_links(tenant_id,guardian_id,user_id,linked_by_user_id)
  values(v_guardian.tenant_id,p_guardian_id,v_user_id,v_user_id)
  on conflict(guardian_id,user_id) do nothing;

  insert into public.audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(
    v_guardian.tenant_id,
    v_user_id,
    'guardian.portal.claimed',
    'guardian_profile',
    p_guardian_id,
    jsonb_build_object('email',v_email)
  );

  return true;
end;
$$;

revoke all on function public.find_claimable_guardian_profiles() from public,anon;
grant execute on function public.find_claimable_guardian_profiles() to authenticated;
revoke all on function public.claim_guardian_profile(uuid) from public,anon;
grant execute on function public.claim_guardian_profile(uuid) to authenticated;

comment on function public.find_claimable_guardian_profiles() is
'Returns only active guardian profiles whose currently effective email exactly matches the authenticated account and are not already linked.';
comment on function public.claim_guardian_profile(uuid) is
'Links an authenticated account to an active guardian profile only when the account email matches a guardian email whose effective period includes the current date.';
