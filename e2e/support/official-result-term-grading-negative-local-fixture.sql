-- Local synthetic-only negative versions for #1316.
-- Executed by the bounded authenticated Playwright test against verified
-- loopback Supabase. No production or hosted database connection is allowed.
begin;
insert into public.grading_scales(
  id,tenant_id,school_id,scale_key,version,display_name,
  effective_from,effective_to,decimal_places,status,created_by_user_id
) values
('e2f80000-0000-4000-8000-000000000009',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'E2E-FUTURE','v1','Synthetic Future Grading',
 '2026-09-01',null,0,'draft','70000000-0000-4000-8000-000000000001'),
('e2f80000-0000-4000-8000-00000000000a',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'E2E-EXPIRED','v1','Synthetic Expired Grading',
 '2026-01-12','2026-03-01',0,'draft','70000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.grading_scale_bands(
 id,tenant_id,school_id,grading_scale_id,minimum_value,maximum_value,
 symbol,pass_classification,sort_order
) values
('e2f90000-0000-4000-8000-000000000009',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'e2f80000-0000-4000-8000-000000000009',0,100,'FUT','neutral',0),
('e2f90000-0000-4000-8000-00000000000a',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'e2f80000-0000-4000-8000-00000000000a',0,100,'EXP','neutral',0)
on conflict (id) do nothing;
update public.grading_scales set status='active'
where id in (
 'e2f80000-0000-4000-8000-000000000009',
 'e2f80000-0000-4000-8000-00000000000a'
) and status='draft';
commit;
