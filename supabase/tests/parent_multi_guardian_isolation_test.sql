begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fe000000-0000-4000-8000-000000000001','parent-multi-guardian@example.test','authenticated','authenticated',now(),now());

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values
  ('fe100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','First','Guardian','MULTI-GUARD-001'),
  ('fe100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Second','Guardian','MULTI-GUARD-002');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,effective_from)
values
  ('fe200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','parent',true,current_date-10),
  ('fe200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000002','parent',true,current_date-10);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values
  ('fe300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe100000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001'),
  ('fe300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fe100000-0000-4000-8000-000000000002','fe000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select is(
  jsonb_array_length(public.get_parent_family_overview()->'children'),
  2,
  'one parent account may aggregate children through multiple linked guardian identities'
);

select ok(
  public.get_parent_family_overview()->'children' @> jsonb_build_array(jsonb_build_object('learner_id','50000000-0000-4000-8000-000000000001')),
  'first linked guardian contributes only its active child'
);

select ok(
  public.get_parent_family_overview()->'children' @> jsonb_build_array(jsonb_build_object('learner_id','50000000-0000-4000-8000-000000000002')),
  'second linked guardian contributes only its active child'
);

reset role;
update public.learner_guardians
set effective_to=current_date-1
where id='fe200000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  jsonb_array_length(public.get_parent_family_overview()->'children'),
  1,
  'ending one guardian relationship removes only that guardian-child path'
);

select is(
  public.get_parent_family_overview()->'children'->0->>'learner_id',
  '50000000-0000-4000-8000-000000000002',
  'the independently linked active child remains visible'
);

reset role;
delete from public.guardian_user_links
where id='fe300000-0000-4000-8000-000000000002';
set local role authenticated;

select is(
  jsonb_array_length(public.get_parent_family_overview()->'children'),
  0,
  'removing the remaining guardian-account link removes that child immediately'
);

select results_eq(
  $$select id from public.guardian_profiles where id in ('fe100000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000002')$$,
  ARRAY[]::uuid[],
  'parent account cannot browse guardian identity rows directly despite linked family access'
);

reset role;
select * from finish();
rollback;
