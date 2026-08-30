begin;

select plan(6);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values
  ('fa120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Postal','Guardian','REPORT-POST-001'),
  ('fa120000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','No Postal','Guardian','REPORT-POST-002');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from)
values
  ('fa130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000001','guardian',19,current_date-10),
  ('fa130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000002','guardian',20,current_date-10);

insert into public.guardian_addresses(id,tenant_id,guardian_id,address_type,label,address_line_1,town_or_city,postal_code,is_primary,effective_from)
values
  ('fa140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fa120000-0000-4000-8000-000000000001','physical','Home','10 Residential Street','Swakopmund',null,true,current_date-20),
  ('fa140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fa120000-0000-4000-8000-000000000001','postal','Post','P.O. Box 123','Swakopmund','13001',false,current_date-20),
  ('fa140000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fa120000-0000-4000-8000-000000000002','physical','Home','20 Residential Street','Swakopmund',null,true,current_date-20);

create temporary table report_guardian_snapshot(guardian_id uuid primary key, data jsonb) on commit drop;
insert into report_guardian_snapshot(guardian_id,data)
select (item->>'guardian_id')::uuid,item
from jsonb_array_elements(app_private.report_card_guardians_snapshot('50000000-0000-4000-8000-000000000001')) item
where item->>'guardian_id' in ('fa120000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000002');

select is(
  (select jsonb_array_length(data->'addresses') from report_guardian_snapshot where guardian_id='fa120000-0000-4000-8000-000000000001'),
  1,
  'report-card guardian snapshot exposes the postal address when both postal and physical addresses exist'
);

select is(
  (select data->'addresses'->0->>'type' from report_guardian_snapshot where guardian_id='fa120000-0000-4000-8000-000000000001'),
  'postal',
  'report-card correspondence address is explicitly postal'
);

select is(
  (select data->'addresses'->0->>'line1' from report_guardian_snapshot where guardian_id='fa120000-0000-4000-8000-000000000001'),
  'P.O. Box 123',
  'postal address is selected even when the physical address is marked primary'
);

select ok(
  not (app_private.report_card_guardians_snapshot('50000000-0000-4000-8000-000000000001')::text like '%10 Residential Street%'),
  'physical residential address is not copied into report-card correspondence data'
);

select is(
  (select jsonb_array_length(data->'addresses') from report_guardian_snapshot where guardian_id='fa120000-0000-4000-8000-000000000002'),
  0,
  'guardian without a postal address receives no report-card mailing address instead of a residential fallback'
);

select ok(
  not (app_private.report_card_guardians_snapshot('50000000-0000-4000-8000-000000000001')::text like '%20 Residential Street%'),
  'no-postal guardian residential address remains excluded from report-card mailing data'
);

select * from finish();
rollback;
