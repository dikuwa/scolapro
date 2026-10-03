begin;

select plan(18);

select has_function('public','bulk_create_subject_offerings',array['uuid','integer','uuid[]','uuid[]','smallint'],'bulk offering RPC exists');
select has_function('public','bulk_create_teacher_allocations',array['uuid','integer','uuid[]','uuid[]','uuid[]','uuid','date','date'],'bulk allocation RPC exists');

select is(has_function_privilege('anon','public.bulk_create_subject_offerings(uuid,integer,uuid[],uuid[],smallint)','EXECUTE'),false,'anon cannot bulk-create offerings');
select is(has_function_privilege('authenticated','public.bulk_create_subject_offerings(uuid,integer,uuid[],uuid[],smallint)','EXECUTE'),true,'authenticated can invoke guarded offering RPC');
select is(has_function_privilege('anon','public.bulk_create_teacher_allocations(uuid,integer,uuid[],uuid[],uuid[],uuid,date,date)','EXECUTE'),false,'anon cannot bulk-create allocations');
select is(has_function_privilege('authenticated','public.bulk_create_teacher_allocations(uuid,integer,uuid[],uuid[],uuid[],uuid,date,date)','EXECUTE'),true,'authenticated can invoke guarded allocation RPC');

insert into public.tenants(id,name,slug)
values('fd000000-0000-4000-8000-000000000001','Bulk Timetable Tenant','bulk-timetable-tenant');
insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fd010000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','Bulk Timetable School','BT-001','Erongo','Swakopmund');

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fd020000-0000-4000-8000-000000000001','bulk-admin@example.test','authenticated','authenticated',now(),now()),
('fd020000-0000-4000-8000-000000000002','bulk-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(id,tenant_id,school_id,user_id,role_key,active_from) values
('fd030000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','fd020000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
('fd030000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','fd020000-0000-4000-8000-000000000002','teacher','2026-01-01');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name) values
('fd040000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001',2026,'G8','Grade 8'),
('fd040000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001',2026,'G9','Grade 9');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name) values
('fd050000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','fd040000-0000-4000-8000-000000000001',2026,'8A','8A'),
('fd050000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','fd040000-0000-4000-8000-000000000001',2026,'8B','8B'),
('fd050000-0000-4000-8000-000000000003','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','fd040000-0000-4000-8000-000000000002',2026,'9A','9A');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status) values
('fd060000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','BULK-MATH','Bulk Mathematics','active'),
('fd060000-0000-4000-8000-000000000002','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','BULK-SCI','Bulk Science','active');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values('fd070000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','BT-T01','Bulk','Teacher','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id)
values('fd080000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001','fd070000-0000-4000-8000-000000000001','teacher','2026-01-01','2026-12-31','fd020000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fd020000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  (select concat_ws(':',r->>'created',r->>'existing',r->>'requested') from (select public.bulk_create_subject_offerings(
    'fd010000-0000-4000-8000-000000000001',2026,
    array['fd060000-0000-4000-8000-000000000001'::uuid,'fd060000-0000-4000-8000-000000000002'::uuid],
    array['fd040000-0000-4000-8000-000000000001'::uuid,'fd040000-0000-4000-8000-000000000002'::uuid],5::smallint
  ) r) x),
  '4:0:4','bulk offering creates subject x grade combinations'
);

select is((select count(*)::integer from public.subject_offerings where school_id='fd010000-0000-4000-8000-000000000001' and periods_per_cycle=5),4,'bulk offerings use canonical table');

select is(
  (select concat_ws(':',r->>'created',r->>'existing') from (select public.bulk_create_subject_offerings(
    'fd010000-0000-4000-8000-000000000001',2026,
    array['fd060000-0000-4000-8000-000000000001'::uuid,'fd060000-0000-4000-8000-000000000002'::uuid],
    array['fd040000-0000-4000-8000-000000000001'::uuid,'fd040000-0000-4000-8000-000000000002'::uuid],7::smallint
  ) r) x),
  '0:4','existing combinations are skipped without rewrite'
);

select is((select count(*)::integer from public.subject_offerings where school_id='fd010000-0000-4000-8000-000000000001' and periods_per_cycle=5),4,'existing periods remain unchanged');

insert into public.teaching_groups(id,tenant_id,school_id,academic_year,subject_offering_id,code,name,status,effective_from,created_by_user_id)
select 'fd090000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','fd010000-0000-4000-8000-000000000001',2026,
so.id,'bulk-math-g8-group','Bulk Mathematics Grade 8 Group','active','2026-01-01','fd020000-0000-4000-8000-000000000001'
from public.subject_offerings so
where so.school_id='fd010000-0000-4000-8000-000000000001'
and so.subject_id='fd060000-0000-4000-8000-000000000001'
and so.grade_id='fd040000-0000-4000-8000-000000000001';

select is(
  (select concat_ws(':',r->>'created',r->>'duplicates',r->>'conflicts',r->>'incompatible',r->>'group_links_created') from (select public.bulk_create_teacher_allocations(
    'fd010000-0000-4000-8000-000000000001',2026,
    array(select id from public.subject_offerings where school_id='fd010000-0000-4000-8000-000000000001' order by id),
    array['fd050000-0000-4000-8000-000000000001'::uuid,'fd050000-0000-4000-8000-000000000002'::uuid,'fd050000-0000-4000-8000-000000000003'::uuid],
    array['fd090000-0000-4000-8000-000000000001'::uuid],
    'fd070000-0000-4000-8000-000000000001','2026-02-01',null
  ) r) x),
  '6:0:0:6:2','bulk allocations create grade-compatible pairs and group links'
);

select is((select count(*)::integer from public.teacher_allocations where school_id='fd010000-0000-4000-8000-000000000001' and staff_member_id='fd070000-0000-4000-8000-000000000001'),6,'bulk allocations use canonical teacher_allocations');
select is((select count(*)::integer from public.teaching_group_allocations where teaching_group_id='fd090000-0000-4000-8000-000000000001'),2,'selected group links to matching canonical allocations');

select is(
  (select concat_ws(':',r->>'created',r->>'duplicates',r->>'group_links_created',r->>'group_links_existing') from (select public.bulk_create_teacher_allocations(
    'fd010000-0000-4000-8000-000000000001',2026,
    array(select id from public.subject_offerings where school_id='fd010000-0000-4000-8000-000000000001' order by id),
    array['fd050000-0000-4000-8000-000000000001'::uuid,'fd050000-0000-4000-8000-000000000002'::uuid,'fd050000-0000-4000-8000-000000000003'::uuid],
    array['fd090000-0000-4000-8000-000000000001'::uuid],
    'fd070000-0000-4000-8000-000000000001','2026-02-01',null
  ) r) x),
  '0:6:0:2','repeat bulk allocation is idempotent'
);

reset role;
select set_config('request.jwt.claim.sub','fd020000-0000-4000-8000-000000000002',true);
set local role authenticated;

select throws_ok($$select public.bulk_create_subject_offerings(
  'fd010000-0000-4000-8000-000000000001',2026,
  array['fd060000-0000-4000-8000-000000000001'::uuid],
  array['fd040000-0000-4000-8000-000000000001'::uuid],5::smallint
)$$,'Permission denied','teacher cannot bulk-create offerings');

select throws_ok($$select public.bulk_create_teacher_allocations(
  'fd010000-0000-4000-8000-000000000001',2026,
  array[(select id from public.subject_offerings where school_id='fd010000-0000-4000-8000-000000000001' limit 1)],
  array['fd050000-0000-4000-8000-000000000001'::uuid],'{}'::uuid[],
  'fd070000-0000-4000-8000-000000000001','2026-02-01',null
)$$,'Permission denied','teacher cannot bulk-create allocations');

reset role;
select set_config('request.jwt.claim.sub','fd020000-0000-4000-8000-000000000001',true);
set local role authenticated;

select throws_ok($$select public.bulk_create_subject_offerings(
  'fd010000-0000-4000-8000-000000000001',2026,
  array['00000000-0000-4000-8000-000000000099'::uuid],
  array['fd040000-0000-4000-8000-000000000001'::uuid],5::smallint
)$$,'Subject selection is outside school scope','invalid subject fails before writes');

select is((select count(*)::integer from public.subject_offerings where school_id='fd010000-0000-4000-8000-000000000001'),4,'failed validation leaves offering count unchanged');

select * from finish();
rollback;
