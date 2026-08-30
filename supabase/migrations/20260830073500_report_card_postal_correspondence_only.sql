-- Report-card correspondence must use postal addresses only.
-- Physical/residential, work, and other guardian addresses remain available in the
-- guardian record for administration, but must never become a report-card mailing
-- address, envelope label, or postal sticker fallback.

create or replace function app_private.report_card_guardians_snapshot(p_learner_id uuid)
returns jsonb
language sql
security definer
set search_path = public, app_private
stable
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'guardian_id', gp.id,
      'name', concat_ws(' ', gp.first_names, gp.surname),
      'preferred_name', gp.preferred_name,
      'relationship_type', lg.relationship_type,
      'priority', lg.priority,
      'is_legal_guardian', lg.is_legal_guardian,
      'is_emergency_contact', lg.is_emergency_contact,
      'is_pickup_authorized', lg.is_pickup_authorized,
      'contacts', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'type', gc.contact_type,
            'label', gc.label,
            'value', gc.contact_value,
            'is_primary', gc.is_primary
          )
          order by gc.is_primary desc, gc.contact_type, gc.created_at
        )
        from public.guardian_contacts gc
        where gc.guardian_id = gp.id
          and gc.effective_to is null
      ), '[]'::jsonb),
      'addresses', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'type', ga.address_type,
            'label', ga.label,
            'line1', ga.address_line_1,
            'line2', ga.address_line_2,
            'locality', ga.suburb_or_locality,
            'town', ga.town_or_city,
            'region', ga.region,
            'postal_code', ga.postal_code,
            'country', ga.country,
            'is_primary', ga.is_primary
          )
          order by ga.is_primary desc, ga.created_at
        )
        from public.guardian_addresses ga
        where ga.guardian_id = gp.id
          and ga.effective_to is null
          and ga.address_type = 'postal'
      ), '[]'::jsonb)
    )
    order by lg.priority, lg.is_legal_guardian desc, gp.surname, gp.first_names
  ), '[]'::jsonb)
  from public.learner_guardians lg
  join public.guardian_profiles gp
    on gp.id = lg.guardian_id
   and gp.status = 'active'
  where lg.learner_id = p_learner_id
    and lg.effective_to is null;
$$;

revoke execute on function app_private.report_card_guardians_snapshot(uuid) from public, anon, authenticated;
