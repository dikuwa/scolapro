begin;

select plan(7);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fe000000-0000-4000-8000-000000000001','parent-sibling-reuse@example.test','authenticated','authenticated',now(),now());

insert into public.guardian_profiles(id,tenant_id,first_names,surname,identity_number)
values('fe100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Sibling','Guardian','SIBLING-GUARD-001');

insert into public.learner_guardians(id,tenant_id,learner_id,guardian_id,relationship_type,is_legal_guardian,effective_from)
values
  ('fe200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','parent',true,current_date-10),
  ('fe200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','50000000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000001','parent',true,current_date-10);

insert into public.guardian_user_links(id,tenant_id,guardian_id,user_id,linked_by_user_id)
values('fe300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe100000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select is(
  jsonb_array_length(public.get_parent_family_overview()->'children'),
  2,
  'one reused guardian identity exposes both actively related siblings to the linked parent account'
);

select ok(
  public.get_parent_family_overview()->'children' @> jsonb_build_array(jsonb_build_object('learner_id','50000000-0000-4000-8000-000000000001')),
  'first active sibling is visible through the reused guardian identity'
);

select ok(
  public.get_parent_family_overview()->'children' @> jsonb_build_array(jsonb_build_object('learner_id','50000000-0000-4000-8000-000000000002')),
  'second active sibling is visible through the same guardian identity'
);

reset role;
update public.learner_guardians
set effective_to=current_date-1
where id='fe200000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  jsonb_array_length(public.get_parent_family_overview()->'children'),
  1,
  'ending one sibling relationship removes only that learner from the parent family scope'
);

select is(
  public.get_parent_family_overview()->'children'->0->>'learner_id',
  '50000000-0000-4000-8000-000000000002',
  'the other active sibling remains visible through the reused guardian identity'
);

reset role;
delete from public.guardian_user_links
where id='fe300000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  jsonb_array_length(public.get_parent_family_overview()->'children'),
  0,
  'removing the guardian-account link immediately removes all remaining sibling access'
);

select results_eq(
  $$select id from public.guardian_profiles where id='fe100000-0000-4000-8000-000000000001'$$,
  ARRAY[]::uuid[],
  'family access does not grant direct guardian identity table reads'
);

reset role;
select * from finish();
rollback;
