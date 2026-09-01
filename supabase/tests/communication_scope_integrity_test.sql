begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fc700000-0000-4000-8000-000000000001','communication-scope-author@example.test','authenticated','authenticated',now(),now()),
  ('fc700000-0000-4000-8000-000000000002','communication-scope-other@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values('fc710000-0000-4000-8000-000000000001','Communication Scope Tenant B','communication-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fc720000-0000-4000-8000-000000000001','fc710000-0000-4000-8000-000000000001','Communication Scope School B','COMM-SCOPE-B','Khomas','Windhoek');

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values
  ('fc730000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Communication','Learner A','2010-01-01','unspecified'),
  ('fc730000-0000-4000-8000-000000000002','fc710000-0000-4000-8000-000000000001','Communication','Learner B','2010-01-01','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values
  ('fc740000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc730000-0000-4000-8000-000000000001',2026,current_date,'current'),
  ('fc740000-0000-4000-8000-000000000002','fc710000-0000-4000-8000-000000000001','fc720000-0000-4000-8000-000000000001','fc730000-0000-4000-8000-000000000002',2026,current_date,'current');

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values('fc750000-0000-4000-8000-000000000001','fc710000-0000-4000-8000-000000000001','Communication','Staff B','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('fc760000-0000-4000-8000-000000000001','fc710000-0000-4000-8000-000000000001','fc720000-0000-4000-8000-000000000001','fc750000-0000-4000-8000-000000000001','staff',current_date,'fc700000-0000-4000-8000-000000000001');

insert into public.communication_templates(id,tenant_id,school_id,template_key,channel,name,active,created_by_user_id)
values
  ('fc770000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','scope-a','email','Scope A',true,'fc700000-0000-4000-8000-000000000001'),
  ('fc770000-0000-4000-8000-000000000002','fc710000-0000-4000-8000-000000000001','fc720000-0000-4000-8000-000000000001','scope-b','email','Scope B',true,'fc700000-0000-4000-8000-000000000001');

insert into public.communication_template_versions(id,template_id,version,language,body_preview,variables,status,created_by_user_id)
values
  ('fc780000-0000-4000-8000-000000000001','fc770000-0000-4000-8000-000000000001',1,'en','Scope A body','[]'::jsonb,'draft','fc700000-0000-4000-8000-000000000001'),
  ('fc780000-0000-4000-8000-000000000002','fc770000-0000-4000-8000-000000000002',1,'en','Scope B body','[]'::jsonb,'draft','fc700000-0000-4000-8000-000000000001');

select throws_ok(
  $$insert into public.communication_messages(tenant_id,school_id,channel,body,audience_type,status,created_by_user_id)
    values('fc710000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','email','Bad tenant scope','individual','draft','fc700000-0000-4000-8000-000000000001')$$,
  'Communication scope mismatch: school does not belong to tenant',
  'message tenant must match school tenant'
);

select lives_ok(
  $$insert into public.communication_messages(id,tenant_id,school_id,channel,body,audience_type,status,created_by_user_id)
    values('fc790000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','email','Valid scope','individual','draft','fc700000-0000-4000-8000-000000000001')$$,
  'valid same-school message remains allowed'
);

select throws_ok(
  $$update public.communication_messages
       set created_by_user_id='fc700000-0000-4000-8000-000000000002'
     where id='fc790000-0000-4000-8000-000000000001'$$,
  'Communication message scope and author are immutable',
  'message author provenance cannot be rewritten after creation'
);

select throws_ok(
  $$update public.communication_messages
       set template_version_id='fc780000-0000-4000-8000-000000000002'
     where id='fc790000-0000-4000-8000-000000000001'$$,
  'Communication template version does not match message scope/channel',
  'message cannot attach a template version from another school'
);

select lives_ok(
  $$update public.communication_messages
       set template_version_id='fc780000-0000-4000-8000-000000000001'
     where id='fc790000-0000-4000-8000-000000000001'$$,
  'same-school same-channel template remains allowed'
);

select throws_ok(
  $$insert into public.communication_recipients(tenant_id,school_id,message_id,learner_id,destination)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc790000-0000-4000-8000-000000000001','fc730000-0000-4000-8000-000000000002','learner-b@example.test')$$,
  'Communication recipient scope mismatch: learner is not currently enrolled at school',
  'recipient cannot reference a learner from another school'
);

select throws_ok(
  $$insert into public.communication_recipients(tenant_id,school_id,message_id,staff_member_id,destination)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc790000-0000-4000-8000-000000000001','fc750000-0000-4000-8000-000000000001','staff-b@example.test')$$,
  'Communication recipient scope mismatch: staff member is not actively assigned to school',
  'recipient cannot reference staff from another school'
);

select lives_ok(
  $$insert into public.communication_recipients(tenant_id,school_id,message_id,learner_id,destination)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fc790000-0000-4000-8000-000000000001','fc730000-0000-4000-8000-000000000001','learner-a@example.test')$$,
  'recipient learner with a current same-school enrolment remains allowed'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_communication_message_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_communication_message_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_communication_recipient_identity_scope()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_communication_recipient_identity_scope()','EXECUTE'),
  'communication integrity trigger helpers are not directly executable by client roles'
);

select * from finish();
rollback;
