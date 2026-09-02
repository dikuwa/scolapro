begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fcb00000-0000-4000-8000-000000000001','detention-pref-boundary@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fcb00000-0000-4000-8000-000000000001','school_admin',current_date-30
);

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values('fcb10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Boundary','Supervisor','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
) values(
  'fcb20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fcb10000-0000-4000-8000-000000000001','teacher',current_date-30,'fcb00000-0000-4000-8000-000000000001'
);

select ok(
  has_table_privilege('authenticated','public.detention_supervision_preferences','SELECT'),
  'authenticated role retains preference read privilege'
);
select ok(
  has_table_privilege('authenticated','public.detention_supervision_preferences','INSERT'),
  'authenticated role retains preference insert privilege'
);
select ok(
  has_table_privilege('authenticated','public.detention_supervision_preferences','UPDATE'),
  'authenticated role retains preference update privilege'
);
select ok(
  not has_table_privilege('authenticated','public.detention_supervision_preferences','DELETE'),
  'authenticated role cannot delete preference rows and erase lifecycle provenance'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fcb00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  public.set_detention_supervision_eligibility(
    '22222222-2222-4222-8222-222222222222','fcb10000-0000-4000-8000-000000000001',false
  ),
  true,
  'governed RPC can create an explicit opt-out'
);

select throws_ok(
  $$delete from public.detention_supervision_preferences
    where school_id='22222222-2222-4222-8222-222222222222'
      and staff_member_id='fcb10000-0000-4000-8000-000000000001'$$,
  'permission denied for table detention_supervision_preferences',
  'school leader cannot silently revert an opt-out by deleting its preference row'
);

select is(
  public.set_detention_supervision_eligibility(
    '22222222-2222-4222-8222-222222222222','fcb10000-0000-4000-8000-000000000001',true
  ),
  true,
  're-enabling supervision remains an explicit governed state transition'
);

select is(
  (select count(*)::integer from public.audit_events
   where entity_type='detention_supervision_preference'
     and metadata->>'staff_member_id'='fcb10000-0000-4000-8000-000000000001'
     and event_type in ('detention_supervision.preference_disabled','detention_supervision.preference_enabled')),
  2,
  'opt-out and re-enable transitions both retain durable audit provenance'
);

reset role;
select * from finish();
rollback;