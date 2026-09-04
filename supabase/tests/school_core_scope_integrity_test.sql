begin;

select plan(12);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fe000000-0000-4000-8000-000000000001','school-core-scope@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values
  ('fe100000-0000-4000-8000-000000000001','School Core Tenant A','school-core-tenant-a'),
  ('fe100000-0000-4000-8000-000000000002','School Core Tenant B','school-core-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('fe110000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','School Core A','SCHOOL-CORE-A','Khomas','Windhoek'),
  ('fe110000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000002','School Core B','SCHOOL-CORE-B','Khomas','Windhoek');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001','hod',current_date);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,status)
values
  ('fe120000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','CORE-T1','Teacher','One','active'),
  ('fe120000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000001','CORE-T2','Teacher','Two','active'),
  ('fe120000-0000-4000-8000-000000000003','fe100000-0000-4000-8000-000000000002','CORE-T3','Teacher','Three','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id
)
values(
  'fe130000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001','fe120000-0000-4000-8000-000000000001','teacher',current_date-1,'fe000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$insert into public.school_settings(tenant_id,school_id,setting_key,setting_value)
    values('fe100000-0000-4000-8000-000000000002','fe110000-0000-4000-8000-000000000001','scope-test','{}'::jsonb)$$,
  'school_settings scope mismatch: school does not belong to tenant',
  'school settings tenant must match school tenant'
);

select lives_ok(
  $$insert into public.school_settings(id,tenant_id,school_id,setting_key,setting_value)
    values('fe140000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001','scope-test','{}'::jsonb)$$,
  'valid school setting remains allowed'
);

select throws_ok(
  $$update public.school_settings set tenant_id='fe100000-0000-4000-8000-000000000002', school_id='fe110000-0000-4000-8000-000000000002'
    where id='fe140000-0000-4000-8000-000000000001'$$,
  'school_settings tenant and school are immutable',
  'school setting scope cannot be moved after creation'
);

select throws_ok(
  $$insert into public.grading_scales(tenant_id,school_id,scale_key,version,display_name,effective_from,decimal_places,status,created_by_user_id)
    values('fe100000-0000-4000-8000-000000000002','fe110000-0000-4000-8000-000000000001','test','1','Test Scale',current_date,0,'draft','fe000000-0000-4000-8000-000000000001')$$,
  'grading_scales scope mismatch: school does not belong to tenant',
  'grading scale tenant must match school tenant'
);

select throws_ok(
  $$insert into public.examination_cycles(tenant_id,school_id,academic_year,cycle_key,display_name,authority,status)
    values('fe100000-0000-4000-8000-000000000002','fe110000-0000-4000-8000-000000000001',2196,'test','Test Cycle','school','setup')$$,
  'examination_cycles scope mismatch: school does not belong to tenant',
  'examination cycle tenant must match school tenant'
);

select throws_ok(
  $$insert into public.school_late_arrival_policies(school_id,tenant_id,weekly_threshold,detention_weekday,carry_forward,active,cumulative_threshold)
    values('fe110000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000002',3,5,true,true,3)$$,
  'school_late_arrival_policies scope mismatch: school does not belong to tenant',
  'late-arrival policy tenant must match school tenant'
);

select throws_ok(
  $$insert into public.detention_supervision_preferences(tenant_id,school_id,staff_member_id,eligible)
    values('fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001','fe120000-0000-4000-8000-000000000003',true)$$,
  'Detention supervision preference scope mismatch: staff member does not belong to tenant',
  'detention preference cannot reference staff from another tenant'
);

select throws_ok(
  $$insert into public.detention_supervision_preferences(tenant_id,school_id,staff_member_id,eligible)
    values('fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001','fe120000-0000-4000-8000-000000000002',true)$$,
  'Detention supervision preference scope mismatch: staff member has no current school assignment',
  'detention preference requires a current school assignment'
);

select lives_ok(
  $$insert into public.detention_supervision_preferences(id,tenant_id,school_id,staff_member_id,eligible)
    values('fe150000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001','fe120000-0000-4000-8000-000000000001',true)$$,
  'valid detention supervision preference remains allowed'
);

select throws_ok(
  $$update public.detention_supervision_preferences set staff_member_id='fe120000-0000-4000-8000-000000000002'
    where id='fe150000-0000-4000-8000-000000000001'$$,
  'Detention supervision preference tenant, school, and staff identity are immutable',
  'detention preference identity cannot be moved after creation'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_school_scoped_root_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_scoped_root_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_detention_supervision_preference_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_detention_supervision_preference_scope_integrity()','EXECUTE'),
  'school-core integrity trigger helpers are private from client roles'
);

select is(
  (select count(*)::integer from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and (
      (c.relname='school_settings' and t.tgname='school_settings_scope_integrity_trg') or
      (c.relname='grading_scales' and t.tgname='grading_scales_scope_integrity_trg') or
      (c.relname='examination_cycles' and t.tgname='examination_cycles_scope_integrity_trg') or
      (c.relname='school_late_arrival_policies' and t.tgname='late_arrival_policy_scope_integrity_trg') or
      (c.relname='detention_supervision_preferences' and t.tgname='detention_supervision_preference_scope_integrity_trg')
    )),
  5,
  'five school-core scope-integrity triggers are installed'
);

select * from finish();
rollback;