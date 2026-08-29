begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('f7000000-0000-4000-8000-000000000001','parent-isolation@example.test','authenticated','authenticated',now(),now());

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values('f7100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Parent','Isolation','PARENT-TST-001');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,effective_from)
values('f7200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','f7100000-0000-4000-8000-000000000001','parent',true,current_date);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values('f7300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f7100000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','f7000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(
  jsonb_array_length(public.get_parent_family_overview()->'children'),
  1,
  'parent family overview returns only actively linked children'
);

select is(
  public.get_parent_family_overview()->'children'->0->>'learner_id',
  '50000000-0000-4000-8000-000000000001',
  'parent family overview returns the linked learner identity'
);

select ok(
  not (public.get_parent_family_overview()->'children' @> jsonb_build_array(jsonb_build_object('learner_id','50000000-0000-4000-8000-000000000002'))),
  'unlinked learner is not exposed through parent family overview'
);

update public.learner_guardians
set effective_to=current_date-1
where id='f7200000-0000-4000-8000-000000000001';

select is(
  jsonb_array_length(public.get_parent_family_overview()->'children'),
  0,
  'ended guardian relationship immediately removes learner from parent family overview'
);

select ok(
  not has_table_privilege('authenticated','public.learners','UPDATE'),
  'parent/authenticated clients are not granted learner mutation privileges by the parent portal read model'
);

select * from finish();
rollback;
