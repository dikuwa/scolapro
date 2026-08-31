-- Cover foreign-key columns on the configurable Sports & Houses foundation.
-- These indexes support FK maintenance and direct joins without changing the governed RPC/RLS model.

create index sports_age_groups_created_by_idx
  on public.sports_age_groups(created_by_user_id);
create index sports_age_groups_tenant_idx
  on public.sports_age_groups(tenant_id);

create index sports_houses_created_by_idx
  on public.sports_houses(created_by_user_id);
create index sports_houses_tenant_idx
  on public.sports_houses(tenant_id);

create index sports_learner_house_assigned_by_idx
  on public.sports_learner_house_assignments(assigned_by_user_id);
create index sports_learner_house_house_idx
  on public.sports_learner_house_assignments(house_id);
create index sports_learner_house_tenant_idx
  on public.sports_learner_house_assignments(tenant_id);

create index sports_staff_house_assigned_by_idx
  on public.sports_staff_house_assignments(assigned_by_user_id);
create index sports_staff_house_house_idx
  on public.sports_staff_house_assignments(house_id);
create index sports_staff_house_staff_idx
  on public.sports_staff_house_assignments(staff_member_id);
create index sports_staff_house_tenant_idx
  on public.sports_staff_house_assignments(tenant_id);

create index sports_year_settings_created_by_idx
  on public.sports_year_settings(created_by_user_id);
create index sports_year_settings_tenant_idx
  on public.sports_year_settings(tenant_id);
