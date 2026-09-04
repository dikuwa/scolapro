-- Governed school-admin configuration for the official report-card template.
-- Settings remain school-scoped and are frozen into each generated snapshot by
-- the companion template-profile enrichment trigger.

create or replace function app_private.can_manage_report_card_settings(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.school_memberships m
      where m.school_id = p_school_id
        and m.user_id = auth.uid()
        and m.role_key in ('school_admin','principal','deputy_principal')
        and m.active_from <= current_date
        and (m.active_to is null or m.active_to >= current_date)
    );
$$;

revoke all on function app_private.can_manage_report_card_settings(uuid)
from public, anon, authenticated;

create or replace function public.get_report_card_school_settings(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare
  v_document_profile jsonb := '{}'::jsonb;
  v_report_settings jsonb := '{}'::jsonb;
  v_subjects jsonb := '[]'::jsonb;
begin
  if not app_private.can_manage_report_card_settings(p_school_id) then
    raise exception 'Not authorised to manage report-card settings';
  end if;

  select coalesce(setting_value, '{}'::jsonb)
  into v_document_profile
  from public.school_settings
  where school_id = p_school_id and setting_key = 'document_profile';

  select coalesce(setting_value, '{}'::jsonb)
  into v_report_settings
  from public.school_settings
  where school_id = p_school_id and setting_key = 'report_card_settings';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'subject_id', s.id,
      'subject_code', s.subject_code,
      'subject_name', s.display_name,
      'minimum_pass_mark', case
        when jsonb_typeof(ss.setting_value -> 'minimum_pass_mark') = 'number'
          then ss.setting_value -> 'minimum_pass_mark'
        else null
      end,
      'promotional', coalesce((ss.setting_value ->> 'promotional')::boolean, true),
      'show_on_report_card', coalesce((ss.setting_value ->> 'show_on_report_card')::boolean, true)
    ) order by s.display_name
  ), '[]'::jsonb)
  into v_subjects
  from public.subjects s
  left join public.school_settings ss
    on ss.school_id = s.school_id
   and ss.setting_key = 'report_card_subject.' || s.id::text
  where s.school_id = p_school_id
    and s.status = 'active';

  return jsonb_build_object(
    'document_profile', coalesce(v_document_profile, '{}'::jsonb),
    'report_card_settings', coalesce(v_report_settings, '{}'::jsonb),
    'subjects', coalesce(v_subjects, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_report_card_school_settings(uuid) to authenticated;

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
  v_user uuid := auth.uid();
  v_document_profile jsonb;
  v_report_settings jsonb;
begin
  if not app_private.can_manage_report_card_settings(p_school_id) then
    raise exception 'Not authorised to manage report-card settings';
  end if;

  v_document_profile := jsonb_strip_nulls(jsonb_build_object(
    'former_name', nullif(trim(p_document_profile ->> 'former_name'), ''),
    'logo_url', nullif(trim(p_document_profile ->> 'logo_url'), ''),
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

  insert into public.school_settings(school_id,setting_key,setting_value,updated_by)
  values(p_school_id,'document_profile',v_document_profile,v_user)
  on conflict (school_id,setting_key) do update
    set setting_value = excluded.setting_value,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into public.school_settings(school_id,setting_key,setting_value,updated_by)
  values(p_school_id,'report_card_settings',v_report_settings,v_user)
  on conflict (school_id,setting_key) do update
    set setting_value = excluded.setting_value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

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
  v_user uuid := auth.uid();
begin
  if not app_private.can_manage_report_card_settings(p_school_id) then
    raise exception 'Not authorised to manage report-card settings';
  end if;
  if not exists(select 1 from public.subjects where id=p_subject_id and school_id=p_school_id) then
    raise exception 'Subject does not belong to this school';
  end if;
  if p_minimum_pass_mark is not null and (p_minimum_pass_mark < 0 or p_minimum_pass_mark > 100) then
    raise exception 'Minimum pass mark must be between 0 and 100';
  end if;

  insert into public.school_settings(school_id,setting_key,setting_value,updated_by)
  values(
    p_school_id,
    'report_card_subject.' || p_subject_id::text,
    jsonb_build_object(
      'minimum_pass_mark', p_minimum_pass_mark,
      'promotional', coalesce(p_promotional,true),
      'show_on_report_card', coalesce(p_show_on_report_card,true)
    ),
    v_user
  )
  on conflict (school_id,setting_key) do update
    set setting_value = excluded.setting_value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

grant execute on function public.save_report_card_subject_setting(uuid,uuid,numeric,boolean,boolean) to authenticated;

comment on function public.get_report_card_school_settings(uuid) is 'Returns governed school document/report-card template settings and active subject report rules.';
comment on function public.save_report_card_school_settings(uuid,jsonb,jsonb) is 'Updates school-scoped document identity and report-card presentation rules.';
comment on function public.save_report_card_subject_setting(uuid,uuid,numeric,boolean,boolean) is 'Updates one subject report-card pass/promotional/display rule.';
