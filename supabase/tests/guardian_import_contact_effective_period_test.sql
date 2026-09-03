begin;

select plan(6);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status) values
('fdc70000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Import','Guardian','active'),
('fdc70000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Import','Guardian','active'),
('fdc70000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Import','Guardian','active');

insert into public.guardian_contacts(
  id,tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from,effective_to
) values
('fdc71000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fdc70000-0000-4000-8000-000000000001','email','current-finite@example.test',true,current_date-5,current_date+5),
('fdc71000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fdc70000-0000-4000-8000-000000000001','mobile','081 111 1111',true,current_date-5,current_date),
('fdc71000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fdc70000-0000-4000-8000-000000000002','email','future@example.test',true,current_date+5,null),
('fdc71000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','fdc70000-0000-4000-8000-000000000002','mobile','082 222 2222',true,current_date+5,null),
('fdc71000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','fdc70000-0000-4000-8000-000000000003','email','expired@example.test',true,current_date-10,current_date-1),
('fdc71000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','fdc70000-0000-4000-8000-000000000003','mobile','083 333 3333',true,current_date-10,current_date-1);

select is(
  app_private.guardian_import_contact_matches(
    '11111111-1111-4111-8111-111111111111','Import','Guardian','current-finite@example.test','{}'::text[]
  ),
  array['fdc70000-0000-4000-8000-000000000001'::uuid],
  'currently effective finite-period email remains valid guardian import identity evidence'
);

select is(
  app_private.guardian_import_contact_matches(
    '11111111-1111-4111-8111-111111111111','Import','Guardian',null,array['0811111111']::text[]
  ),
  array['fdc70000-0000-4000-8000-000000000001'::uuid],
  'contact whose effective end is today remains valid guardian import identity evidence'
);

select is(
  app_private.guardian_import_contact_matches(
    '11111111-1111-4111-8111-111111111111','Import','Guardian','future@example.test','{}'::text[]
  ),
  '{}'::uuid[],
  'future-start email is not used as guardian import identity evidence early'
);

select is(
  app_private.guardian_import_contact_matches(
    '11111111-1111-4111-8111-111111111111','Import','Guardian',null,array['0822222222']::text[]
  ),
  '{}'::uuid[],
  'future-start phone is not used as guardian import identity evidence early'
);

select is(
  app_private.guardian_import_contact_matches(
    '11111111-1111-4111-8111-111111111111','Import','Guardian','expired@example.test','{}'::text[]
  ),
  '{}'::uuid[],
  'expired email is not used as guardian import identity evidence'
);

select is(
  app_private.guardian_import_contact_matches(
    '11111111-1111-4111-8111-111111111111','Import','Guardian',null,array['0833333333']::text[]
  ),
  '{}'::uuid[],
  'expired phone is not used as guardian import identity evidence'
);

select * from finish();
rollback;
