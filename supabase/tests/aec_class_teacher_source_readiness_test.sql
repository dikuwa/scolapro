begin;

select plan(24);

update public.register_classes
set register_teacher_staff_id=null
where school_id='22222222-2222-4222-8222-222222222222'
  and academic_year=2026
  and register_teacher_staff_id is not null;

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('facc0000-0000-4000-8000-000000000001','aec-class-teacher-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','facc0000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.staff_members(id,tenant_id,employee_number,first_name,last_name,initials,status) values
  ('facc1000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','AEC-T-001','Valid','Teacher','VT','active'),
  ('facc1000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','AEC-T-002','Legacy','Teacher','LT','active'),
  ('facc1000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','AEC-T-003','Expired','Teacher','ET','active');

insert into public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,effective_to,created_by_user_id
) values
  ('facc2000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','facc1000-0000-4000-8000-000000000001','teacher','2026-01-01',null,'facc0000-0000-4000-8000-000000000001'),
  ('facc2000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','facc1000-0000-4000-8000-000000000003','teacher','2025-01-01','2025-12-31','facc0000-0000-4000-8000-000000000001');

insert into public.statutory_form_definitions(id,form_key,display_name,authority,description,active) values
  ('facc3000-0000-4000-8000-000000000001','aec_class_teacher_qa','AEC Class Teacher QA','QA','Test-only statutory source contract',true);
insert into public.statutory_form_versions(
  id,form_definition_id,version_key,effective_from,source_reference,field_schema,mapping_schema,validation_schema,status
) values (
  'facc3000-0000-4000-8000-000000000002','facc3000-0000-4000-8000-000000000001','qa-v1','2026-01-01','test fixture','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'draft'
);
insert into public.statutory_reporting_cycles(
  id,tenant_id,school_id,form_version_id,academic_year,cycle_key,reference_date,status,created_by_user_id
) values (
  'facc3000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'facc3000-0000-4000-8000-000000000002',2026,'aec-class-teacher-qa','2026-09-01','open','facc0000-0000-4000-8000-000000000001'
);

select ok(
  to_regprocedure('app_private.register_teacher_has_school_overlap(uuid,uuid,uuid,integer)') is not null,
  'private year-aware register-teacher placement helper exists'
);
select ok(
  to_regprocedure('app_private.build_register_class_teacher_statutory_source(uuid,integer)') is not null,
  'private register-class teacher statutory source helper exists'
);
select ok(
  not has_function_privilege('anon','app_private.build_register_class_teacher_statutory_source(uuid,integer)','EXECUTE'),
  'anonymous users cannot execute the private class-teacher source helper'
);
select ok(
  not has_function_privilege('authenticated','app_private.build_register_class_teacher_statutory_source(uuid,integer)','EXECUTE'),
  'authenticated users cannot bypass the public statutory workflow through the private helper'
);
select ok(
  exists(
    select 1 from pg_trigger t
    where t.tgrelid='public.register_classes'::regclass
      and t.tgname='register_class_scope_integrity_trg'
      and not t.tgisinternal
      and pg_get_triggerdef(t.oid) ilike '%register_teacher_staff_id%'
  ),
  'register-class integrity trigger covers teacher assignment changes'
);

select lives_ok(
  $$insert into public.register_classes(
      id,tenant_id,school_id,grade_id,academic_year,class_code,display_name,register_teacher_staff_id
    ) values(
      'facc4000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      '30000000-0000-4000-8000-000000000008',2026,'AEC-LEGACY','AEC Legacy Class','facc1000-0000-4000-8000-000000000002'
    )$$,
  'legacy-compatible class insert may retain same-tenant teacher identity before placement reconciliation'
);
select throws_ok(
  $$update public.register_classes
    set register_teacher_staff_id='facc1000-0000-4000-8000-000000000002'
    where id='40000000-0000-4000-8000-00000000001a'$$,
  'P0001',
  'Register teacher is not actively assigned to this school',
  'changing an existing class to unplaced staff is blocked even through direct table mutation'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','facc0000-0000-4000-8000-000000000001',true);
set local role authenticated;

select is(
  public.assign_register_teacher('40000000-0000-4000-8000-00000000001a','facc1000-0000-4000-8000-000000000001'),
  true,
  'governed mutation accepts active staff with placement overlapping the class academic year'
);
select is(
  (select register_teacher_staff_id from public.register_classes where id='40000000-0000-4000-8000-00000000001a'),
  'facc1000-0000-4000-8000-000000000001'::uuid,
  'validated register-teacher assignment persists on the class'
);
select throws_ok(
  $$select public.assign_register_teacher('40000000-0000-4000-8000-00000000001b','facc1000-0000-4000-8000-000000000002')$$,
  'Register teacher is not actively assigned to this school',
  'governed mutation rejects same-tenant staff with no school placement'
);
select throws_ok(
  $$select public.assign_register_teacher('40000000-0000-4000-8000-00000000001b','facc1000-0000-4000-8000-000000000003')$$,
  'Register teacher is not actively assigned to this school',
  'governed mutation rejects a school placement outside the class academic year'
);
select is(
  public.assign_register_teacher('40000000-0000-4000-8000-00000000001a',null),
  true,
  'management can deliberately clear a register teacher while readiness remains visible'
);
select is(
  public.assign_register_teacher('40000000-0000-4000-8000-00000000001a','facc1000-0000-4000-8000-000000000001'),
  true,
  'validated register teacher can be restored'
);
select is(
  (select count(*)::integer from public.audit_events
   where entity_type='register_class'
     and entity_id='40000000-0000-4000-8000-00000000001a'
     and event_type in ('register_class.teacher_assigned','register_class.teacher_unassigned')),
  3,
  'governed class-teacher changes remain auditable'
);

create temporary table aec_teacher_snapshot on commit drop as
select public.generate_statutory_snapshot('facc3000-0000-4000-8000-000000000003') as snapshot_id;

select ok(
  (select snapshot_id is not null from aec_teacher_snapshot),
  'management user can generate the statutory snapshot with class-teacher readiness source'
);
select is(
  (select s.source_summary->>'generator'
   from public.statutory_snapshots s join aec_teacher_snapshot x on x.snapshot_id=s.id),
  'school-operational-v2',
  'snapshot records the upgraded statutory source generator version'
);
select is(
  (select (s.values #>> '{structure,register_class_teacher_source,total_classes}')::integer
   from public.statutory_snapshots s join aec_teacher_snapshot x on x.snapshot_id=s.id),
  (select count(*)::integer from public.register_classes where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026),
  'class-teacher statutory source covers every configured register class'
);
select is(
  (select (s.values #>> '{structure,register_class_teacher_source,assigned_classes}')::integer
   from public.statutory_snapshots s join aec_teacher_snapshot x on x.snapshot_id=s.id),
  2,
  'snapshot distinguishes the two assigned classes from all unassigned classes'
);
select is(
  (select (s.values #>> '{structure,register_class_teacher_source,verified_assigned_classes}')::integer
   from public.statutory_snapshots s join aec_teacher_snapshot x on x.snapshot_id=s.id),
  1,
  'snapshot counts the governed valid class-teacher assignment as verified'
);
select is(
  (select (s.values #>> '{structure,register_class_teacher_source,unverified_assigned_classes}')::integer
   from public.statutory_snapshots s join aec_teacher_snapshot x on x.snapshot_id=s.id),
  1,
  'snapshot exposes the legacy same-tenant assignment without school placement as unverified'
);
select is(
  (select (s.values #>> '{structure,register_class_teacher_source,unassigned_classes}')::integer
   from public.statutory_snapshots s join aec_teacher_snapshot x on x.snapshot_id=s.id),
  (select count(*)::integer from public.register_classes where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026)-2,
  'unassigned class count remains explicit for statutory readiness'
);
select is(
  (select item #>> '{register_teacher,staff_member_id}'
   from public.statutory_snapshots s
   join aec_teacher_snapshot x on x.snapshot_id=s.id
   cross join lateral jsonb_array_elements(s.values #> '{structure,register_class_teacher_source,classes}') item
   where item->>'class_id'='40000000-0000-4000-8000-00000000001a'),
  'facc1000-0000-4000-8000-000000000001',
  'class roster snapshot preserves the validated register-teacher identity'
);
select is(
  (select item #>> '{register_teacher,assignment_verified}'
   from public.statutory_snapshots s
   join aec_teacher_snapshot x on x.snapshot_id=s.id
   cross join lateral jsonb_array_elements(s.values #> '{structure,register_class_teacher_source,classes}') item
   where item->>'class_id'='40000000-0000-4000-8000-00000000001a'),
  'true',
  'validated register-teacher identity is marked verified in the statutory source'
);
select is(
  (select item #>> '{register_teacher,assignment_verified}'
   from public.statutory_snapshots s
   join aec_teacher_snapshot x on x.snapshot_id=s.id
   cross join lateral jsonb_array_elements(s.values #> '{structure,register_class_teacher_source,classes}') item
   where item->>'class_id'='facc4000-0000-4000-8000-000000000001'),
  'false',
  'legacy assignment remains visible but explicitly unverified rather than silently trusted'
);
select is(
  (select count(*)::integer
   from public.statutory_snapshots s
   join aec_teacher_snapshot x on x.snapshot_id=s.id
   cross join lateral jsonb_array_elements(s.values #> '{structure,register_class_teacher_source,classes}') item
   where item ? 'phone' or item ? 'national_id' or item ? 'signature'),
  0,
  'statutory class-teacher source does not fabricate contact, identity-document, or signature values'
);

reset role;
select * from finish();
rollback;
