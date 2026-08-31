begin;

select plan(13);

select ok(to_regclass('public.sports_age_groups_created_by_idx') is not null,
  'sports age-group creator foreign key is indexed');
select ok(to_regclass('public.sports_age_groups_tenant_idx') is not null,
  'sports age-group tenant foreign key is indexed');
select ok(to_regclass('public.sports_houses_created_by_idx') is not null,
  'sports house creator foreign key is indexed');
select ok(to_regclass('public.sports_houses_tenant_idx') is not null,
  'sports house tenant foreign key is indexed');
select ok(to_regclass('public.sports_learner_house_assigned_by_idx') is not null,
  'learner house assignment actor foreign key is indexed');
select ok(to_regclass('public.sports_learner_house_house_idx') is not null,
  'learner house assignment house foreign key is indexed');
select ok(to_regclass('public.sports_learner_house_tenant_idx') is not null,
  'learner house assignment tenant foreign key is indexed');
select ok(to_regclass('public.sports_staff_house_assigned_by_idx') is not null,
  'staff house assignment actor foreign key is indexed');
select ok(to_regclass('public.sports_staff_house_house_idx') is not null,
  'staff house assignment house foreign key is indexed');
select ok(to_regclass('public.sports_staff_house_staff_idx') is not null,
  'staff house assignment staff foreign key is indexed');
select ok(to_regclass('public.sports_staff_house_tenant_idx') is not null,
  'staff house assignment tenant foreign key is indexed');
select ok(to_regclass('public.sports_year_settings_created_by_idx') is not null,
  'sports year-settings creator foreign key is indexed');
select ok(to_regclass('public.sports_year_settings_tenant_idx') is not null,
  'sports year-settings tenant foreign key is indexed');

select * from finish();
rollback;
