-- Freeze the school document profile and report-card presentation rules into every
-- newly generated report-card snapshot. The renderer must use the frozen values so
-- later school-setting changes never rewrite a historical certified document.
--
-- School settings used by this contract:
--   document_profile
--     { former_name, logo_url, physical_address, telephone, fax, email,
--       postal_address, town, school_name_font }
--   report_card_settings
--     { show_percentages, show_non_promotional_subjects, remarks_mode,
--       show_pass_mark_legend }
--   report_card_subject.<subject_id>
--     { minimum_pass_mark, promotional, show_on_report_card }
--
-- `school_name_font = "old_english"` is intentionally school-scoped. It is NOT a
-- platform default. Schools without that explicit setting use the normal site /
-- document font.

create or replace function app_private.enrich_report_card_snapshot_template_profile()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_school_identity jsonb := '{}'::jsonb;
  v_document_profile jsonb := '{}'::jsonb;
  v_report_settings jsonb := '{}'::jsonb;
  v_terms jsonb := '[]'::jsonb;
  v_register_teacher jsonb := '{}'::jsonb;
  v_principal jsonb := '{}'::jsonb;
  v_next_term_start date;
begin
  if new.school_id is null then
    raise exception 'Report-card snapshot school is required';
  end if;

  select jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'emis_number', s.emis_number,
    'region', s.region,
    'town', s.town
  )
  into v_school_identity
  from public.schools s
  where s.id = new.school_id;

  if v_school_identity is null then
    raise exception 'Report-card snapshot school not found';
  end if;

  select coalesce(setting_value, '{}'::jsonb)
  into v_document_profile
  from public.school_settings
  where school_id = new.school_id
    and setting_key = 'document_profile';

  select coalesce(setting_value, '{}'::jsonb)
  into v_report_settings
  from public.school_settings
  where school_id = new.school_id
    and setting_key = 'report_card_settings';

  select case when sm.id is null then '{}'::jsonb else jsonb_build_object(
    'staff_member_id', sm.id,
    'name', concat_ws(' ', sm.first_name, sm.last_name)
  ) end
  into v_register_teacher
  from public.register_classes rc
  left join public.staff_members sm on sm.id = rc.register_teacher_staff_id
  where rc.id = (
    select e.register_class_id
    from public.enrolments e
    where e.id = new.enrolment_id
  )
  limit 1;

  select case when sm.id is null then '{}'::jsonb else jsonb_build_object(
    'staff_member_id', sm.id,
    'name', concat_ws(' ', sm.first_name, sm.last_name)
  ) end
  into v_principal
  from public.school_memberships membership
  left join public.staff_members sm on sm.id = membership.staff_member_id
  where membership.school_id = new.school_id
    and membership.role_key = 'principal'
    and membership.active_from <= current_date
    and (membership.active_to is null or membership.active_to >= current_date)
  order by membership.active_from desc
  limit 1;

  select t.starts_on
  into v_next_term_start
  from public.academic_terms t
  join public.academic_years y on y.id = t.academic_year_id
  where t.school_id = new.school_id
    and y.year = new.academic_year
    and t.term_number > new.term_number
  order by t.term_number
  limit 1;

  -- A Term 2 report can show Terms 1-2 and a Term 3 report can show Terms 1-3.
  -- Each result row freezes the subject presentation rule that was effective when
  -- this snapshot was generated.
  select coalesce(jsonb_agg(term_payload order by term_number), '[]'::jsonb)
  into v_terms
  from (
    select
      t.term_number,
      jsonb_build_object(
        'number', t.term_number,
        'name', coalesce(t.display_name, 'Term ' || t.term_number),
        'results', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'official_result_id', r.id,
              'subject_offering_id', r.subject_offering_id,
              'subject_id', s.id,
              'subject_code', s.subject_code,
              'subject_name', s.display_name,
              'result_value', r.result_value,
              'result_status', r.result_status,
              'symbol', r.symbol,
              'minimum_pass_mark', case
                when jsonb_typeof(ss.setting_value -> 'minimum_pass_mark') = 'number'
                  then (ss.setting_value ->> 'minimum_pass_mark')::numeric
                else null
              end,
              'promotional', coalesce((ss.setting_value ->> 'promotional')::boolean, true),
              'show_on_report_card', coalesce((ss.setting_value ->> 'show_on_report_card')::boolean, true),
              'approved_at', r.approved_at
            )
            order by s.display_name
          )
          from public.official_results r
          join public.subject_offerings so on so.id = r.subject_offering_id
          join public.subjects s on s.id = so.subject_id
          left join public.school_settings ss
            on ss.school_id = new.school_id
           and ss.setting_key = 'report_card_subject.' || s.id::text
          where r.enrolment_id = new.enrolment_id
            and r.term_number = t.term_number
        ), '[]'::jsonb)
      ) as term_payload
    from public.academic_terms t
    join public.academic_years y on y.id = t.academic_year_id
    where t.school_id = new.school_id
      and y.year = new.academic_year
      and t.term_number between 1 and new.term_number
  ) term_rows;

  new.data_snapshot := coalesce(new.data_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'school_identity', v_school_identity,
      'school_document_profile', coalesce(v_document_profile, '{}'::jsonb),
      'report_card_settings', coalesce(v_report_settings, '{}'::jsonb),
      'report_terms', coalesce(v_terms, '[]'::jsonb),
      'register_teacher', coalesce(v_register_teacher, '{}'::jsonb),
      'principal', coalesce(v_principal, '{}'::jsonb),
      'next_term_starts_on', v_next_term_start
    );

  return new;
end;
$$;

revoke all on function app_private.enrich_report_card_snapshot_template_profile()
from public, anon, authenticated;

drop trigger if exists report_card_snapshot_template_profile_enrichment_trg
on public.report_card_snapshots;

create trigger report_card_snapshot_template_profile_enrichment_trg
before insert on public.report_card_snapshots
for each row
execute function app_private.enrich_report_card_snapshot_template_profile();

comment on function app_private.enrich_report_card_snapshot_template_profile() is
  'Freezes school identity/document branding, report-card display settings, cumulative term results, subject pass/promotional rules, register teacher, principal, and next-term date into a new report-card snapshot.';
