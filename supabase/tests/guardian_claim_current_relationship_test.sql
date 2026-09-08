begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fde00000-0000-4000-8000-000000000001','claim.relationship@example.test','authenticated','authenticated',now(),now());

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number,status) values
('fde10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Guardian','CLAIM-REL-CURRENT','active'),
('fde10000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Expired','Guardian','CLAIM-REL-EXPIRED','active'),
('fde10000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Future','Guardian','CLAIM-REL-FUTURE','active'),
('fde10000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','None','Guardian','CLAIM-REL-NONE','active'),
('fde10000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','Unrelated','Guardian','CLAIM-REL-UNRELATED','active'),
('fde10000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','Relationship','Source','CLAIM-REL-SOURCE','active');

insert into public.guardian_contacts(id,tenant_id,guardian_id,contact_type,contact_value,is_primary,effective_from) values
('fde20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000001','email','claim.relationship@example.test',true,current_date-30),
('fde20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000002','email','claim.relationship@example.test',true,current_date-30),
('fde20000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000003','email','claim.relationship@example.test',true,current_date-30),
('fde20000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000004','email','claim.relationship@example.test',true,current_date-30),
('fde20000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000005','email','claim.relationship@example.test',true,current_date-30);

insert into public.learners(id,tenant_id,first_names,surname) values
('fde30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Current','Child'),
('fde30000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Expired','Child'),
('fde30000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Future','Child'),
('fde30000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','Other','Child'),
('fde30000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','Ended','Current Guardian Child');

insert into public.learner_guardians(
  tenant_id,learner_id,guardian_id,relationship_type,effective_from,effective_to
) values
('11111111-1111-4111-8111-111111111111','fde30000-0000-4000-8000-000000000001','fde10000-0000-4000-8000-000000000001','guardian',current_date-30,null),
('11111111-1111-4111-8111-111111111111','fde30000-0000-4000-8000-000000000002','fde10000-0000-4000-8000-000000000002','guardian',current_date-60,current_date-1),
('11111111-1111-4111-8111-111111111111','fde30000-0000-4000-8000-000000000003','fde10000-0000-4000-8000-000000000003','guardian',current_date+1,null),
('11111111-1111-4111-8111-111111111111','fde30000-0000-4000-8000-000000000004','fde10000-0000-4000-8000-000000000006','guardian',current_date-30,null),
('11111111-1111-4111-8111-111111111111','fde30000-0000-4000-8000-000000000005','fde10000-0000-4000-8000-000000000001','guardian',current_date-60,current_date-1);

insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status
) values
('fde40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fde30000-0000-4000-8000-000000000001',extract(year from current_date)::integer,'CLAIM-REL-001',current_date-100,null,'current'),
('fde40000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fde30000-0000-4000-8000-000000000005',extract(year from current_date)::integer,'CLAIM-REL-002',current_date-100,null,'current');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fde00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select count(*)::integer from public.find_claimable_guardian_profiles()
   where guardian_id='fde10000-0000-4000-8000-000000000001'),
  1,
  'matching guardian with a current active learner relationship is claimable'
);
select is(
  (select count(*)::integer from public.find_claimable_guardian_profiles()
   where guardian_id='fde10000-0000-4000-8000-000000000002'),
  0,
  'guardian with only an expired learner relationship is not claimable'
);
select is(
  (select count(*)::integer from public.find_claimable_guardian_profiles()
   where guardian_id='fde10000-0000-4000-8000-000000000003'),
  0,
  'guardian with only a future learner relationship is not claimable'
);
select is(
  (select count(*)::integer from public.find_claimable_guardian_profiles()
   where guardian_id='fde10000-0000-4000-8000-000000000004'),
  0,
  'relationship-free guardian identity is not claimable'
);
select is(
  (select count(*)::integer from public.find_claimable_guardian_profiles()
   where guardian_id='fde10000-0000-4000-8000-000000000005'),
  0,
  'an unrelated guardian relationship cannot satisfy a matching identity claim'
);

select throws_ok(
  $$select public.claim_guardian_profile('fde10000-0000-4000-8000-000000000002'::uuid)$$,
  'P0001','Guardian has no current active learner relationship',
  'expired guardian relationship is denied at mutation boundary'
);
select throws_ok(
  $$select public.claim_guardian_profile('fde10000-0000-4000-8000-000000000003'::uuid)$$,
  'P0001','Guardian has no current active learner relationship',
  'future-only guardian relationship is denied at mutation boundary'
);
select throws_ok(
  $$select public.claim_guardian_profile('fde10000-0000-4000-8000-000000000004'::uuid)$$,
  'P0001','Guardian has no current active learner relationship',
  'relationship-free guardian identity is denied at mutation boundary'
);
select throws_ok(
  $$select public.claim_guardian_profile('fde10000-0000-4000-8000-000000000005'::uuid)$$,
  'P0001','Guardian has no current active learner relationship',
  'unrelated guardian relationship evidence is denied at mutation boundary'
);

select is(
  public.claim_guardian_profile('fde10000-0000-4000-8000-000000000001'::uuid),
  true,
  'current active guardian relationship permits the matching claim'
);

select is(
  jsonb_array_length(public.get_parent_family_overview()->'children'),
  1,
  'resulting parent scope contains only learners with current active guardian relationships'
);
select is(
  public.get_parent_family_overview()->'children'->0->>'learner_id',
  'fde30000-0000-4000-8000-000000000001',
  'ended relationship learner is excluded from resulting parent scope'
);

reset role;
select * from finish();
rollback;
