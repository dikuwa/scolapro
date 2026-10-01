-- #923: remove stale broad permissive teaching-plan/schedule policies.
--
-- Governed authoring is already expressed by the canonical
-- "planning authors can ..." permissive policies and enforced as a mandatory
-- AND boundary by the "planning author boundary ..." restrictive policies.
-- These older broad permissive branches therefore add planner work but no
-- effective authority.

drop policy if exists "academic leaders can manage pacing plans [delete]"
  on public.pacing_plans;
drop policy if exists "academic leaders can manage pacing plans [update]"
  on public.pacing_plans;

drop policy if exists "academic leaders can manage pacing items [insert]"
  on public.pacing_plan_items;
drop policy if exists "academic leaders can manage pacing items [update]"
  on public.pacing_plan_items;
drop policy if exists "academic leaders can manage pacing items [delete]"
  on public.pacing_plan_items;

drop policy if exists "scoped staff can manage teaching schedule [insert]"
  on public.teaching_schedule_items;
drop policy if exists "scoped staff can manage teaching schedule [update]"
  on public.teaching_schedule_items;
drop policy if exists "scoped staff can manage teaching schedule [delete]"
  on public.teaching_schedule_items;
