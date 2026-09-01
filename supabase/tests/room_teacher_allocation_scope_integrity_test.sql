begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd000000-0000-4000-8000-000000000001','room-allocation-scope@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values
  ('fd100000-0000-4000-8000-000000000001','Allocation Scope Tenant A','allocation-scope-tenant-a'),
  ('fd100000-0000-4000-8000-000000000002','Allocation Scope Tenant B','allocation-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('fd110000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','Allocation Scope School A','ALLOC-SCOPE-A','Khomas','Windhoek'),
  ('fd110000-0000-4000-8000-000000000002','fd100000-0000-4000-8000-000000000002','Allocation Scope School B','ALLOC-SCOPE-B','Khomas','Windhoek');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('fd120000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001','TST','Test Subject','active');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('fd130000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001',2197,'G8','Grade 8');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('fd140000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001',2197,'fd120000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001',5,'active');

insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values('fd150000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001','fd130000-0000-4000-8000-000000000001',2197,'8A','Grade 8A');

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fd160000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','ALLOC-T1','Teacher','One','active'),
  ('fd160000-0000-4000-8000-000000000002','fd100000-0000-4000-8000-000000000002','ALLOC-T2','Teacher','Two','active');

select throws_ok(
  $$insert into public.school_rooms(tenant_id,school_id,room_code,display_name,status)
    values('fd100000-0000-4000-8000-000000000002','fd110000-0000-4000-8000-000000000001','BAD','Bad Room','active')$$,
  'School room scope mismatch: school does not belong to tenant',
  'school room tenant must match school tenant'
);

select lives_ok(
  $$insert into public.school_rooms(id,tenant_id,school_id,room_code,display_name,status)
    values('fd180000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001','R1','Room 1','active')$$,
  'valid same-school room remains allowed'
);

select throws_ok(
  $$update public.school_rooms set school_id='fd110000-0000-4000-8000-000000000002', tenant_id='fd100000-0000-4000-8000-000000000002'
    where id='fd180000-0000-4000-8000-000000000001'$$,
  'School room tenant and school are immutable',
  'school room scope cannot be moved after creation'
);

select throws_ok(
  $$insert into public.teacher_allocations(
      tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
    ) values(
      'fd100000-0000-4000-8000-000000000002','fd110000-0000-4000-8000-000000000001',2197,
      'fd140000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000001','fd160000-0000-4000-8000-000000000001','2197-01-15'
    )$$,
  'Teacher allocation scope mismatch: school does not belong to tenant',
  'teacher allocation tenant must match school tenant'
);

select throws_ok(
  $$insert into public.teacher_allocations(
      tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
    ) values(
      'fd100000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001',2198,
      'fd140000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000001','fd160000-0000-4000-8000-000000000001','2197-01-15'
    )$$,
  'Teacher allocation scope mismatch: subject offering does not belong to school/year',
  'teacher allocation year must match its subject offering'
);

select throws_ok(
  $$insert into public.teacher_allocations(
      tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
    ) values(
      'fd100000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001',2197,
      'fd140000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000001','fd160000-0000-4000-8000-000000000002','2197-01-15'
    )$$,
  'Teacher allocation scope mismatch: staff member does not belong to tenant',
  'teacher allocation cannot use staff from another tenant'
);

select lives_ok(
  $$insert into public.teacher_allocations(
      id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from,active_to
    ) values(
      'fd190000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','fd110000-0000-4000-8000-000000000001',2197,
      'fd140000-0000-4000-8000-000000000001','fd150000-0000-4000-8000-000000000001','fd160000-0000-4000-8000-000000000001','2197-01-15','2197-11-30'
    )$$,
  'valid in-scope teacher allocation remains allowed'
);

select lives_ok(
  $$update public.teacher_allocations set active_to='2197-12-15' where id='fd190000-0000-4000-8000-000000000001'$$,
  'allocation dates may be corrected without changing allocation identity'
);

select throws_ok(
  $$update public.teacher_allocations set staff_member_id='fd160000-0000-4000-8000-000000000002' where id='fd190000-0000-4000-8000-000000000001'$$,
  'Teacher allocation tenant, school, year, offering, class, and staff identity are immutable',
  'teacher allocation identity cannot be moved after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_school_room_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_room_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_teacher_allocation_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_teacher_allocation_scope_integrity()','EXECUTE'),
  'room and allocation integrity trigger helpers are private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.school_rooms'::regclass and tgname='school_room_scope_integrity_trg' and not tgisinternal),
  1,
  'school rooms have exactly one scope-integrity trigger'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid='public.teacher_allocations'::regclass and tgname='teacher_allocation_scope_integrity_trg' and not tgisinternal),
  1,
  'teacher allocations have exactly one scope-integrity trigger'
);

select * from finish();
rollback;
