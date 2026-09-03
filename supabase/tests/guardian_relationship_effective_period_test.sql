begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fde00000-0000-4000-8000-000000000001','guardian-period-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fde00000-0000-4000-8000-000000000001',
  'school_admin',
  current_date-10
);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values
  ('fde10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Finite','Guardian','active'),
  ('fde10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Future','Guardian','active'),
  ('fde10000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Scheduled','Uncle','active');

insert into public.learner_guardians(
  tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from,effective_to
)
select '11111111-1111-4111-8111-111111111111',sli.learner_id,'fde10000-0000-4000-8000-000000000001','parent',1,current_date-10,current_date+10
from public.school_learner_identifiers sli
where sli.school_id='22222222-2222-4222-8222-222222222222' and sli.admission_number='DEMO-001';

insert into public.learner_guardians(
  tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from,effective_to
)
select '11111111-1111-4111-8111-111111111111',sli.learner_id,'fde10000-0000-4000-8000-000000000002','parent',1,current_date+10,null
from public.school_learner_identifiers sli
where sli.school_id='22222222-2222-4222-8222-222222222222' and sli.admission_number='DEMO-002';

insert into public.learner_guardians(
  tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from,effective_to
)
select '11111111-1111-4111-8111-111111111111',sli.learner_id,'fde10000-0000-4000-8000-000000000003','uncle',1,current_date+8,null
from public.school_learner_identifiers sli
where sli.school_id='22222222-2222-4222-8222-222222222222' and sli.admission_number='DEMO-002';

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values(
  'fde20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'guardians','guardian-periods.xlsx','review','fde00000-0000-4000-8000-000000000001'
);

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values
(
  'fde30000-0000-4000-8000-000000000001','fde20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2,'{}'::jsonb,
  jsonb_build_object('learner_admission_number','DEMO-001','identity_number','','first_names','Finite','surname','Guardian','relationship_type','parent','priority',1),
  'review','[]'::jsonb
),
(
  'fde30000-0000-4000-8000-000000000002','fde20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',3,'{}'::jsonb,
  jsonb_build_object('learner_admission_number','DEMO-002','identity_number','','first_names','Future','surname','Guardian','relationship_type','parent','priority',1),
  'review','[]'::jsonb
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fde00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.reconcile_guardian_import_batch('fde20000-0000-4000-8000-000000000001'::uuid)$$,
  'guardian import reconciliation accepts mixed current and future relationship fixtures'
);

select is(
  (select resolution from public.import_rows where id='fde30000-0000-4000-8000-000000000001'),
  'link',
  'currently effective finite relationship is reusable exact-name evidence'
);
select is(
  (select matched_entity_id from public.import_rows where id='fde30000-0000-4000-8000-000000000001'),
  'fde10000-0000-4000-8000-000000000001'::uuid,
  'finite current relationship resolves to its existing guardian'
);
select is(
  (select resolution from public.import_rows where id='fde30000-0000-4000-8000-000000000002'),
  'error',
  'future-start relationship is not treated as an already-active exact-name link'
);
select is(
  (select matched_entity_id from public.import_rows where id='fde30000-0000-4000-8000-000000000002'),
  null::uuid,
  'future-start relationship does not leak a guardian match into the import row'
);

select lives_ok(
  $$select public.link_existing_guardian_to_learner(
    (select learner_id from public.school_learner_identifiers where school_id='22222222-2222-4222-8222-222222222222' and admission_number='DEMO-002'),
    'fde10000-0000-4000-8000-000000000002'::uuid,
    'parent',true,false,false,1
  )$$,
  'explicit link-now operation can reuse a pre-scheduled open relationship'
);
select is(
  (select effective_from from public.learner_guardians where guardian_id='fde10000-0000-4000-8000-000000000002' and relationship_type='parent' and effective_to is null),
  current_date,
  'link_existing_guardian_to_learner advances a future open relationship to today'
);

select lives_ok(
  $$select public.upsert_guardian_relationship(
    (select learner_id from public.school_learner_identifiers where school_id='22222222-2222-4222-8222-222222222222' and admission_number='DEMO-002'),
    'fde10000-0000-4000-8000-000000000003'::uuid,
    null,null,null,null,'uncle',false,true,false,2,'[]'::jsonb
  )$$,
  'explicit guardian relationship upsert can reuse a pre-scheduled open relationship'
);
select is(
  (select effective_from from public.learner_guardians where guardian_id='fde10000-0000-4000-8000-000000000003' and relationship_type='uncle' and effective_to is null),
  current_date,
  'upsert_guardian_relationship advances a future open relationship to today'
);

reset role;
select * from finish();
rollback;
