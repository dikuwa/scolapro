begin;

select plan(11);

insert into auth.users (id,email,aud,role,created_at,updated_at)
values ('fa100000-0000-4000-8000-000000000001','guardian-enrichment-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fa100000-0000-4000-8000-000000000001','school_admin',current_date);

select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

insert into public.guardian_profiles(id,tenant_id,first_names,surname)
values
  ('fa300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Contactless','Parent'),
  ('fa300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Contactless','Parent');

insert into public.learner_guardians(tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,is_emergency_contact,is_pickup_authorized,priority,effective_from)
select '11111111-1111-4111-8111-111111111111',sli.learner_id,'fa300000-0000-4000-8000-000000000001','parent',true,false,false,1,current_date
from public.school_learner_identifiers sli
where sli.school_id='22222222-2222-4222-8222-222222222222' and sli.admission_number='DEMO-001';

insert into public.learner_guardians(tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,is_emergency_contact,is_pickup_authorized,priority,effective_from)
select '11111111-1111-4111-8111-111111111111',sli.learner_id,'fa300000-0000-4000-8000-000000000002','parent',true,false,false,1,current_date
from public.school_learner_identifiers sli
where sli.school_id='22222222-2222-4222-8222-222222222222' and sli.admission_number='DEMO-002';

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values('fa400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','guardians','guardian-enrichment.xlsx','review','fa100000-0000-4000-8000-000000000001');

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values(
  'fa500000-0000-4000-8000-000000000001',
  'fa400000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2,
  '{}'::jsonb,
  jsonb_build_object(
    'learner_admission_number','DEMO-001',
    'identity_number','',
    'first_names',' Contactless ',
    'surname','Parent',
    'relationship_type','parent',
    'priority',1,
    'is_legal_guardian',true,
    'is_emergency_contact',true,
    'is_pickup_authorized',true,
    'email','contactless.parent@example.test',
    'mobile','081 123 4567',
    'physical_address','ERF 100 TEST STREET',
    'postal_address','P.O. BOX 100 SWAKOPMUND'
  ),
  'review',
  '[]'::jsonb
);

select public.reconcile_guardian_import_batch('fa400000-0000-4000-8000-000000000001');

select is(
  (select resolution from public.import_rows where id='fa500000-0000-4000-8000-000000000001'),
  'link',
  'exact-name guardian already linked to this learner is reused before contact matching'
);

select is(
  (select matched_entity_id from public.import_rows where id='fa500000-0000-4000-8000-000000000001'),
  'fa300000-0000-4000-8000-000000000001'::uuid,
  'same-name guardian linked to another learner is not selected globally'
);

select is(
  (select valid_rows from public.import_batches where id='fa400000-0000-4000-8000-000000000001'),
  1,
  'existing learner-linked guardian enrichment row is immediately valid'
);

select is(public.mark_import_batch_ready('fa400000-0000-4000-8000-000000000001'),true,'enrichment batch can become ready without manual confirmation');
select lives_ok($$select public.commit_guardian_import_batch('fa400000-0000-4000-8000-000000000001')$$,'existing guardian enrichment commits atomically');

select is(
  (select count(*)::integer from public.guardian_profiles where id in ('fa300000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002')),
  2,
  'enrichment does not create a duplicate guardian profile'
);

select ok(
  exists(select 1 from public.guardian_contacts where guardian_id='fa300000-0000-4000-8000-000000000001' and contact_type='email' and lower(contact_value)='contactless.parent@example.test' and effective_to is null),
  'email contact is enriched onto the existing guardian'
);

select ok(
  exists(select 1 from public.guardian_contacts where guardian_id='fa300000-0000-4000-8000-000000000001' and contact_type='mobile' and contact_value='081 123 4567' and effective_to is null),
  'mobile contact is enriched onto the existing guardian'
);

select ok(
  exists(select 1 from public.guardian_addresses where guardian_id='fa300000-0000-4000-8000-000000000001' and address_type='physical' and address_line_1='ERF 100 TEST STREET' and effective_to is null),
  'physical address is enriched for school records'
);

select ok(
  exists(select 1 from public.guardian_addresses where guardian_id='fa300000-0000-4000-8000-000000000001' and address_type='postal' and address_line_1='P.O. BOX 100 SWAKOPMUND' and effective_to is null),
  'postal address is enriched separately for correspondence'
);

-- A source identity that is not already on the existing exact-name learner link must
-- never silently become a second guardian or overwrite the canonical profile.
insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values('fa400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','guardians','guardian-identity-review.xlsx','review','fa100000-0000-4000-8000-000000000001');

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values(
  'fa500000-0000-4000-8000-000000000002','fa400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2,'{}'::jsonb,
  jsonb_build_object('learner_admission_number','DEMO-001','identity_number','NEW-ID-DO-NOT-AUTO-APPLY','first_names','Contactless','surname','Parent','relationship_type','parent','priority',1,'mobile','081 123 4567'),
  'review','[]'::jsonb
);

select public.reconcile_guardian_import_batch('fa400000-0000-4000-8000-000000000002');

select is(
  (select resolution from public.import_rows where id='fa500000-0000-4000-8000-000000000002'),
  'review',
  'new source identity against an existing learner-linked exact-name guardian requires explicit review'
);

select * from finish();
rollback;
