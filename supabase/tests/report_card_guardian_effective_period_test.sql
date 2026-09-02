begin;

select plan(8);

insert into public.learners(id,tenant_id,first_names,surname,sex) values
('fde00000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Report','Learner','unspecified');

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status) values
('fde10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Guardian','active'),
('fde10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Future','Guardian','active');

insert into public.learner_guardians(
  id,tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from,effective_to
) values
('fde20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fde00000-0000-4000-8000-000000000001','fde10000-0000-4000-8000-000000000001','parent',1,current_date-10,current_date+10),
('fde20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fde00000-0000-4000-8000-000000000001','fde10000-0000-4000-8000-000000000002','guardian',2,current_date+5,null);

insert into public.guardian_contacts(
  id,tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from,effective_to
) values
('fde30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000001','email','current@example.test',true,current_date-5,current_date+5),
('fde30000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000001','mobile','0810000000',false,current_date+5,null);

insert into public.guardian_addresses(
  id,tenant_id,guardian_id,address_type,address_line_1,is_primary,effective_from,effective_to
) values
('fde40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000001','postal','Current Postal',true,current_date-5,current_date+5),
('fde40000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000001','postal','Future Postal',false,current_date+5,null);

select is(
  jsonb_array_length(app_private.report_card_guardians_snapshot('fde00000-0000-4000-8000-000000000001')),
  1,
  'report snapshot includes only guardian relationships effective today'
);
select is(
  app_private.report_card_guardians_snapshot('fde00000-0000-4000-8000-000000000001')->0->>'name',
  'Current Guardian',
  'currently effective finite-period guardian relationship remains included'
);
select is(
  app_private.report_card_guardians_snapshot('fde00000-0000-4000-8000-000000000001') @> '[{"guardian_id":"fde10000-0000-4000-8000-000000000002"}]'::jsonb,
  false,
  'future-start guardian relationship is excluded from official snapshot'
);
select is(
  jsonb_array_length(app_private.report_card_guardians_snapshot('fde00000-0000-4000-8000-000000000001')->0->'contacts'),
  1,
  'snapshot includes only guardian contacts effective today'
);
select is(
  app_private.report_card_guardians_snapshot('fde00000-0000-4000-8000-000000000001')->0->'contacts'->0->>'value',
  'current@example.test',
  'currently effective finite-period contact remains included'
);
select is(
  jsonb_array_length(app_private.report_card_guardians_snapshot('fde00000-0000-4000-8000-000000000001')->0->'addresses'),
  1,
  'snapshot includes only postal addresses effective today'
);
select is(
  app_private.report_card_guardians_snapshot('fde00000-0000-4000-8000-000000000001')->0->'addresses'->0->>'line1',
  'Current Postal',
  'currently effective finite-period postal address remains included'
);
select is(
  app_private.report_card_guardians_snapshot('fde00000-0000-4000-8000-000000000001')->0->'addresses' @> '[{"line1":"Future Postal"}]'::jsonb,
  false,
  'future-start postal address is excluded from official snapshot'
);

select * from finish();
rollback;
