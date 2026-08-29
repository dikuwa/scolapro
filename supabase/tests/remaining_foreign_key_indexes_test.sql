begin;

select plan(8);

select ok(to_regclass('public.examination_candidate_number_history_assigned_by_idx') is not null,'candidate number history actor FK is indexed');
select ok(to_regclass('public.examination_candidate_number_history_school_idx') is not null,'candidate number history school FK is indexed');
select ok(to_regclass('public.examination_candidate_number_history_tenant_idx') is not null,'candidate number history tenant FK is indexed');
select ok(to_regclass('public.examination_candidates_number_assigned_by_idx') is not null,'candidate number assignment actor FK is indexed');
select ok(to_regclass('public.voluntary_contribution_campaigns_created_by_idx') is not null,'contribution campaign creator FK is indexed');
select ok(to_regclass('public.voluntary_contribution_campaigns_tenant_idx') is not null,'contribution campaign tenant FK is indexed');
select ok(to_regclass('public.voluntary_contribution_items_school_idx') is not null,'contribution item school FK is indexed');
select ok(to_regclass('public.voluntary_contribution_items_tenant_idx') is not null,'contribution item tenant FK is indexed');

select * from finish();
rollback;
