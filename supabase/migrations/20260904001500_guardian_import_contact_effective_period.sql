-- Guardian import identity reconciliation must use only contact details that are
-- effective today. Future-scheduled contacts are not current identity evidence,
-- while currently effective finite-period contacts remain valid matches.

create or replace function app_private.guardian_import_contact_matches(
  p_tenant_id uuid,
  p_first_names text,
  p_surname text,
  p_email text,
  p_phones text[]
)
returns uuid[]
language sql
stable
security definer
set search_path=public,app_private
as $$
  select coalesce(array_agg(distinct gp.id order by gp.id),'{}'::uuid[])
  from public.guardian_profiles gp
  join public.guardian_contacts gc
    on gc.guardian_id=gp.id
   and gc.effective_from<=current_date
   and (gc.effective_to is null or gc.effective_to>=current_date)
  where gp.tenant_id=p_tenant_id
    and lower(regexp_replace(btrim(gp.first_names),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(p_first_names,'')),'\s+',' ','g'))
    and lower(regexp_replace(btrim(gp.surname),'\s+',' ','g'))=lower(regexp_replace(btrim(coalesce(p_surname,'')),'\s+',' ','g'))
    and (
      (p_email is not null and gc.contact_type='email' and lower(btrim(gc.contact_value))=lower(btrim(p_email)))
      or
      (gc.contact_type in ('mobile','phone','whatsapp') and regexp_replace(gc.contact_value,'[^0-9]+','','g')=any(coalesce(p_phones,'{}'::text[])))
    );
$$;

revoke all on function app_private.guardian_import_contact_matches(uuid,text,text,text,text[]) from public,anon,authenticated;

comment on function app_private.guardian_import_contact_matches(uuid,text,text,text,text[]) is
'Returns same-tenant guardians whose normalized name and contact evidence match using only contact rows effective on the current date.';