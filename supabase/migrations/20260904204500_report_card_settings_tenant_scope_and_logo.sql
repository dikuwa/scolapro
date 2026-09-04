-- Repair the official report-card settings write path for schools that do not yet
-- have a school_settings row, and preserve the governed logo_storage_path when the
-- rest of the document profile is saved.

create or replace function public.save_report_card_school_settings(
  p_school_id uuid,
  p_document_profile jsonb,
  p_report_card_settings jsonb
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_tenant_id uuid;
  v_document_profile jsonb;
  v_report_settings jsonb;
begin
  if not app_private.can_manage_report_card_settings(p_school_id) then
    raise exception 'Not authorised to manage report-card settings';
  end if;

  select s.tenant_id into v_tenant_id
  from public.schools s
  where s.id = p_school_id;
  if v_tenant_id is null then
    raise exception 'School not found';
  end if;

  v_document_profile := jsonb_strip_nulls(jsonb_build_object(
    'former_name', nullif(trim(p_document_profile ->> 'former_name'), ''),
    'logo_url', nullif(trim(p_document_profile ->> 'logo_url'), ''),
    'logo_storage_path', nullif(trim(p_document_profile ->> 'logo_storage_path'), ''),
    'physical_address', nullif(trim(p_document_profile ->> 'physical_address'), ''),
    'telephone', nullif(trim(p_document_profile ->> 'telephone'), ''),
    'fax', nullif(trim(p_document_profile ->> 'fax'), ''),
    'email', nullif(trim(p_document_profile ->> 'email'), ''),
    'postal_address', nullif(trim(p_document_profile ->> 'postal_address'), ''),
    'town', nullif(trim(p_document_profile ->> 'town'), ''),
    'school_name_font', case
      when lower(coalesce(p_document_profile ->> 'school_name_font','')) = 'old_english' then 'old_english'
      else 'default'
    end
  ));

  v_report_settings := jsonb_build_object(
    'show_percentages', coalesce((p_report_card_settings ->> 'show_percentages')::boolean, false),
    'show_non_promotional_subjects', coalesce((p_report_card_settings ->> 'show_non_promotional_subjects')::boolean, true),
    'show_pass_mark_legend', coalesce((p_report_card_settings ->> 'show_pass_mark_legend')::boolean, true),
    'remarks_mode', case
      when p_report_card_settings ->> 'remarks_mode' in ('manual','rules','ai_assisted')
        then p_report_card_settings ->> 'remarks_mode'
      else 'manual'
    end,
    'default_remark', nullif(trim(p_report_card_settings ->> 'default_remark'), '')
  );

  insert into public.school_settings(tenant_id,school_id,setting_key,setting_value)
  values(v_tenant_id,p_school_id,'document_profile',v_document_profile)
  on conflict (school_id,setting_key) do update
    set tenant_id = excluded.tenant_id,
        setting_value = excluded.setting_value;

  insert into public.school_settings(tenant_id,school_id,setting_key,setting_value)
  values(v_tenant_id,p_school_id,'report_card_settings',v_report_settings)
  on conflict (school_id,setting_key) do update
    set tenant_id = excluded.tenant_id,
        setting_value = excluded.setting_value;
end;
$$;

revoke all on function public.save_report_card_school_settings(uuid,jsonb,jsonb)
from public, anon, authenticated;
grant execute on function public.save_report_card_school_settings(uuid,jsonb,jsonb) to authenticated;

create or replace function public.save_report_card_subject_setting(
  p_school_id uuid,
  p_subject_id uuid,
  p_minimum_pass_mark numeric,
  p_promotional boolean,
  p_show_on_report_card boolean
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_tenant_id uuid;
begin
  if not app_private.can_manage_report_card_settings(p_school_id) then
    raise exception 'Not authorised to manage report-card settings';
  end if;

  select s.tenant_id into v_tenant_id
  from public.schools s
  where s.id = p_school_id;
  if v_tenant_id is null then
    raise exception 'School not found';
  end if;

  if not exists(select 1 from public.subjects where id=p_subject_id and school_id=p_school_id) then
    raise exception 'Subject does not belong to this school';
  end if;
  if p_minimum_pass_mark is not null and (p_minimum_pass_mark < 0 or p_minimum_pass_mark > 100) then
    raise exception 'Minimum pass mark must be between 0 and 100';
  end if;

  insert into public.school_settings(tenant_id,school_id,setting_key,setting_value)
  values(
    v_tenant_id,
    p_school_id,
    'report_card_subject.' || p_subject_id::text,
    jsonb_build_object(
      'minimum_pass_mark', p_minimum_pass_mark,
      'promotional', coalesce(p_promotional,true),
      'show_on_report_card', coalesce(p_show_on_report_card,true)
    )
  )
  on conflict (school_id,setting_key) do update
    set tenant_id = excluded.tenant_id,
        setting_value = excluded.setting_value;
end;
$$;

revoke all on function public.save_report_card_subject_setting(uuid,uuid,numeric,boolean,boolean)
from public, anon, authenticated;
grant execute on function public.save_report_card_subject_setting(uuid,uuid,numeric,boolean,boolean) to authenticated;

comment on function public.save_report_card_school_settings(uuid,jsonb,jsonb) is
  'Updates tenant-scoped document identity and report-card presentation rules, including the governed stored logo path.';
comment on function public.save_report_card_subject_setting(uuid,uuid,numeric,boolean,boolean) is
  'Updates one tenant-scoped subject report-card pass/promotional/display rule.';
