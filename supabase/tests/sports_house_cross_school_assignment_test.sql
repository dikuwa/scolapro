begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fde00000-0000-4000-8000-000000000001','sports-cross-school-admin@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status) values
('fde10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Sports Cross School B','SPORT-X-B','active');

-- The fixture creator legitimately manages both schools. The test below still proves
-- that an assignment scoped to School A cannot substitute a house from School B.
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fde00000-0000-4000-8000-000000000001','school_admin',current_date-2),
('11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000001','fde00000-0000-4000-8000-000000000001','school_admin',current_date-2);

insert into public.sports_houses(id,tenant_id,school_id,name,short_code,status,created_by_user_id) values
('fde20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Cross School House A','XHA','active','fde00000-0000-4000-8000-000000000001'),
('fde20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fde10000-0000-4000-8000-000000000001','Cross School House B','XHB','active','fde00000-0000-4000-8000-000000000001');

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex) values
('fde30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Sports','Learner','2012-03-10','female');
insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('fde40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fde30000-0000-4000-8000-000000000001',2026,'2026-01-01','current');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status) values
('fde50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','SPORT-X-STAFF','Sports','Staff','active');
insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id) values
('fde60000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fde50000-0000-4000-8000-000000000001','teacher','2026-01-01','fde00000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fde00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.assign_learner_sports_house(
    '22222222-2222-4222-8222-222222222222'::uuid,2026,
    'fde30000-0000-4000-8000-000000000001'::uuid,
    'fde20000-0000-4000-8000-000000000001'::uuid,
    'manual'::text,false
  )$$,
  'School Admin can create a valid learner house assignment'
);
select lives_ok(
  $$select public.assign_staff_sports_house(
    '22222222-2222-4222-8222-222222222222'::uuid,2026,
    'fde50000-0000-4000-8000-000000000001'::uuid,
    'fde20000-0000-4000-8000-000000000001'::uuid,
    'member'::text,'manual'::text,false
  )$$,
  'School Admin can create a valid staff house assignment'
);

select throws_ok(
  $$select public.assign_learner_sports_house(
    '22222222-2222-4222-8222-222222222222'::uuid,2026,
    'fde30000-0000-4000-8000-000000000001'::uuid,
    'fde20000-0000-4000-8000-000000000002'::uuid,
    'manual'::text,false
  )$$,
  'P0001','Sports house must belong to the same tenant and school',
  'learner assignment upsert cannot substitute a house from another school'
);
select is(
  (select house_id from public.sports_learner_house_assignments
   where school_id='22222222-2222-4222-8222-222222222222'::uuid
     and academic_year=2026 and learner_id='fde30000-0000-4000-8000-000000000001'::uuid),
  'fde20000-0000-4000-8000-000000000001'::uuid,
  'failed learner reassignment preserves the original valid house'
);

select throws_ok(
  $$select public.assign_staff_sports_house(
    '22222222-2222-4222-8222-222222222222'::uuid,2026,
    'fde50000-0000-4000-8000-000000000001'::uuid,
    'fde20000-0000-4000-8000-000000000002'::uuid,
    'member'::text,'manual'::text,false
  )$$,
  'P0001','Sports house must belong to the same tenant and school',
  'staff assignment upsert cannot substitute a house from another school'
);
select is(
  (select house_id from public.sports_staff_house_assignments
   where school_id='22222222-2222-4222-8222-222222222222'::uuid
     and academic_year=2026 and staff_member_id='fde50000-0000-4000-8000-000000000001'::uuid),
  'fde20000-0000-4000-8000-000000000001'::uuid,
  'failed staff reassignment preserves the original valid house'
);

reset role;
select * from finish();
rollback;
