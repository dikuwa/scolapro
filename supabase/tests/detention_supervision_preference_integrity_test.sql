begin;

select plan(16);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fc900000-0000-4000-8000-000000000001','detention-pref-admin@example.test','authenticated','authenticated',now(),now()),
  ('fc900000-0000-4000-8000-000000000002','detention-pref-spoof@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fc900000-0000-4000-8000-000000000001',
  'school_admin',
  current_date-30
);

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values
  ('fc910000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Preference','Staff One','active'),
  ('fc910000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Preference','Staff Two','active'),
  ('fc910000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Preference','Unplaced Staff','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('fc920000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc910000-0000-4000-8000-000000000001','teacher',current_date-30,null,'fc900000-0000-4000-8000-000000000001'),
  ('fc920000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc910000-0000-4000-8000-000000000002','teacher',current_date-30,null,'fc900000-0000-4000-8000-000000000001');

insert into public.tenants(id,name,slug)
values('fc930000-0000-4000-8000-000000000001','Detention Preference Tenant B','detention-preference-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values(
  'fc940000-0000-4000-8000-000000000001',
  'fc930000-0000-4000-8000-000000000001',
  'Detention Preference School B',
  'DPS-B',
  'Khomas',
  'Windhoek'
);

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values(
  'fc950000-0000-4000-8000-000000000001',
  'fc930000-0000-4000-8000-000000000001',
  'Other',
  'Tenant Staff',
  'active'
);

select ok(
  to_regprocedure('app_private.enforce_detention_supervision_preference_integrity()') is not null,
  'detention supervision preference integrity helper exists'
);

select ok(
  not has_function_privilege('anon','app_private.enforce_detention_supervision_preference_integrity()','EXECUTE'),
  'anonymous users cannot execute the preference integrity helper'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_detention_supervision_preference_integrity()','EXECUTE'),
  'authenticated users cannot bypass the preference integrity helper boundary'
);

select is(
  (select count(*)::integer
   from pg_trigger
   where tgrelid='public.detention_supervision_preferences'::regclass
     and tgname='detention_supervision_preference_integrity_trg'
     and not tgisinternal),
  1,
  'detention supervision preferences have exactly one provenance trigger'
);

select throws_ok(
  $$insert into public.detention_supervision_preferences(tenant_id,school_id,staff_member_id,eligible)
    values('fc930000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','fc910000-0000-4000-8000-000000000001',true)$$,
  'Detention supervision preference scope mismatch: school does not belong to tenant',
  'preference tenant must match school tenant'
);

select throws_ok(
  $$insert into public.detention_supervision_preferences(tenant_id,school_id,staff_member_id,eligible)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc950000-0000-4000-8000-000000000001',true)$$,
  'Detention supervision preference scope mismatch: staff member does not belong to tenant',
  'preference staff must match tenant'
);

select throws_ok(
  $$insert into public.detention_supervision_preferences(tenant_id,school_id,staff_member_id,eligible)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc910000-0000-4000-8000-000000000003',true)$$,
  'Detention supervision preference scope mismatch: staff member has no current school assignment',
  'same-tenant unplaced staff cannot receive a detention supervision preference'
);

select lives_ok(
  $$insert into public.detention_supervision_preferences(tenant_id,school_id,staff_member_id,eligible)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc910000-0000-4000-8000-000000000001',true)$$,
  'valid current school staff preference remains allowed'
);

select is(
  (select eligible from public.detention_supervision_preferences
   where school_id='22222222-2222-4222-8222-222222222222'
     and staff_member_id='fc910000-0000-4000-8000-000000000001'),
  true,
  'valid preference persists its eligibility state'
);

select throws_ok(
  $$update public.detention_supervision_preferences
    set staff_member_id='fc910000-0000-4000-8000-000000000002'
    where school_id='22222222-2222-4222-8222-222222222222'
      and staff_member_id='fc910000-0000-4000-8000-000000000001'$$,
  'Detention supervision preference tenant, school, and staff identity are immutable',
  'preference identity cannot be moved to a different staff member after creation'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fc900000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$insert into public.detention_supervision_preferences(
      tenant_id,school_id,staff_member_id,eligible,updated_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'fc910000-0000-4000-8000-000000000002',true,'fc900000-0000-4000-8000-000000000002'
    )$$,
  'authorized leader can write a valid preference directly through the existing RLS surface'
);

select is(
  (select updated_by_user_id from public.detention_supervision_preferences
   where school_id='22222222-2222-4222-8222-222222222222'
     and staff_member_id='fc910000-0000-4000-8000-000000000002'),
  'fc900000-0000-4000-8000-000000000001'::uuid,
  'authenticated direct writes are stamped with the real actor instead of a supplied spoofed actor'
);

select is(
  public.set_detention_supervision_eligibility(
    '22222222-2222-4222-8222-222222222222',
    'fc910000-0000-4000-8000-000000000001',
    false
  ),
  true,
  'governed eligibility RPC still updates a valid current school staff preference'
);

select is(
  (select eligible from public.detention_supervision_preferences
   where school_id='22222222-2222-4222-8222-222222222222'
     and staff_member_id='fc910000-0000-4000-8000-000000000001'),
  false,
  'governed preference change persists the opt-out state'
);

select throws_ok(
  $$select public.set_detention_supervision_eligibility(
      '22222222-2222-4222-8222-222222222222',
      'fc910000-0000-4000-8000-000000000003',
      false
    )$$,
  'Active staff assignment not found for school',
  'governed preference RPC rejects unplaced staff'
);

reset role;

select is(
  app_private.pick_detention_supervisor('22222222-2222-4222-8222-222222222222',current_date),
  'fc910000-0000-4000-8000-000000000002'::uuid,
  'automatic supervisor selection honors the hardened opt-out preference while retaining eligible staff'
);

select * from finish();
rollback;