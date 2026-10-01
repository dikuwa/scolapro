-- #946: remove stale assessment FOR ALL policy overlaps while preserving write authority.

drop policy if exists "academic leaders can manage assessment components"
on public.assessment_components;

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

drop policy if exists "academic leaders can manage assessment scheme candidates"
on public.assessment_scheme_candidates;

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

drop policy if exists "academic leaders can manage assessment schemes"
on public.assessment_schemes;

create policy "academic leaders can manage assessment schemes [update]"
on public.assessment_schemes
for update to authenticated
using (app_private.can_manage_current_assessment_school(school_id))
with check (app_private.can_manage_current_assessment_school(school_id));

create policy "academic leaders can manage assessment schemes [delete]"
on public.assessment_schemes
for delete to authenticated
using (app_private.can_manage_current_assessment_school(school_id));
