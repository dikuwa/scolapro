-- #927: remove structural assessment/statutory permissive overlaps.
-- Dedicated SELECT policies already cover every management actor.

drop policy if exists "platform admins manage statutory code mappings" on public.statutory_code_mappings;

create policy "platform admins manage statutory code mappings [insert]"
on public.statutory_code_mappings
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "platform admins manage statutory code mappings [update]"
on public.statutory_code_mappings
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "platform admins manage statutory code mappings [delete]"
on public.statutory_code_mappings
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "platform admins manage statutory code sets" on public.statutory_code_sets;

create policy "platform admins manage statutory code sets [insert]"
on public.statutory_code_sets
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "platform admins manage statutory code sets [update]"
on public.statutory_code_sets
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "platform admins manage statutory code sets [delete]"
on public.statutory_code_sets
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "platform admins manage statutory codes" on public.statutory_codes;

create policy "platform admins manage statutory codes [insert]"
on public.statutory_codes
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "platform admins manage statutory codes [update]"
on public.statutory_codes
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "platform admins manage statutory codes [delete]"
on public.statutory_codes
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "platform admins can manage statutory fields" on public.statutory_form_fields;

create policy "platform admins can manage statutory fields [insert]"
on public.statutory_form_fields
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "platform admins can manage statutory fields [update]"
on public.statutory_form_fields
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "platform admins can manage statutory fields [delete]"
on public.statutory_form_fields
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "platform admins can manage statutory sections" on public.statutory_form_sections;

create policy "platform admins can manage statutory sections [insert]"
on public.statutory_form_sections
for insert to authenticated
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "platform admins can manage statutory sections [update]"
on public.statutory_form_sections
for update to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]))
with check (app_private.has_platform_role(array['platform_admin'::text]));

create policy "platform admins can manage statutory sections [delete]"
on public.statutory_form_sections
for delete to authenticated
using (app_private.has_platform_role(array['platform_admin'::text]));

drop policy if exists "academic leaders can manage assessment components" on public.assessment_components;

create policy "academic leaders can manage assessment components [insert]"
on public.assessment_components
for insert to authenticated
with check (app_private.can_manage_current_assessment_school(school_id));

create policy "academic leaders can manage assessment components [update]"
on public.assessment_components
for update to authenticated
using (app_private.can_manage_current_assessment_school(school_id))
with check (app_private.can_manage_current_assessment_school(school_id));

create policy "academic leaders can manage assessment components [delete]"
on public.assessment_components
for delete to authenticated
using (app_private.can_manage_current_assessment_school(school_id));

drop policy if exists "academic leaders can manage assessment scheme candidates" on public.assessment_scheme_candidates;

create policy "academic leaders can manage assessment scheme candidates [insert]"
on public.assessment_scheme_candidates
for insert to authenticated
with check (app_private.can_manage_current_assessment_school(school_id));

create policy "academic leaders can manage assessment scheme candidates [update]"
on public.assessment_scheme_candidates
for update to authenticated
using (app_private.can_manage_current_assessment_school(school_id))
with check (app_private.can_manage_current_assessment_school(school_id));

create policy "academic leaders can manage assessment scheme candidates [delete]"
on public.assessment_scheme_candidates
for delete to authenticated
using (app_private.can_manage_current_assessment_school(school_id));

drop policy if exists "academic leaders can manage assessment schemes" on public.assessment_schemes;
-- The legacy narrower INSERT policy uses this same name. Remove it before
-- recreating the single command-specific management INSERT policy.
drop policy if exists "academic leaders can manage assessment schemes [insert]"
  on public.assessment_schemes;

create policy "academic leaders can manage assessment schemes [insert]"
on public.assessment_schemes
for insert to authenticated
with check (app_private.can_manage_current_assessment_school(school_id));

create policy "academic leaders can manage assessment schemes [update]"
on public.assessment_schemes
for update to authenticated
using (app_private.can_manage_current_assessment_school(school_id))
with check (app_private.can_manage_current_assessment_school(school_id));

create policy "academic leaders can manage assessment schemes [delete]"
on public.assessment_schemes
for delete to authenticated
using (app_private.can_manage_current_assessment_school(school_id));
