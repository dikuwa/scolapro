begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
  ('fe100000-0000-4000-8000-000000000001','contribution-scope-author@example.test','authenticated','authenticated',now(),now()),
  ('fe100000-0000-4000-8000-000000000002','contribution-scope-reviewer@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000001','school_admin',current_date),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe100000-0000-4000-8000-000000000002','deputy_principal',current_date);

insert into public.tenants(id,name,slug)
values('fe110000-0000-4000-8000-000000000001','Contribution Scope Tenant B','contribution-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values('fe120000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Contribution Scope School B','CONTRIB-SCOPE-B','Khomas','Windhoek');

insert into public.learners(id,tenant_id,first_names,surname,date_of_birth,sex)
values
  ('fe130000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Contribution','Learner A','2010-01-01','unspecified'),
  ('fe130000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Contribution','Learner B','2010-01-01','unspecified');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
values
  ('fe140000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe130000-0000-4000-8000-000000000001',2026,current_date-20,'current'),
  ('fe140000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe130000-0000-4000-8000-000000000002',2026,current_date-20,'current');

insert into public.staff_members(id,tenant_id,first_name,last_name,status)
values('fe150000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Contribution','Receiver','active');

insert into public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,assignment_type,effective_from,created_by_user_id)
values('fe160000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fe120000-0000-4000-8000-000000000001','fe150000-0000-4000-8000-000000000001','staff',current_date-20,'fe100000-0000-4000-8000-000000000001');

select throws_ok(
  $$insert into public.voluntary_contribution_campaigns(
      tenant_id,school_id,academic_year,title,starts_on,ends_on,created_by_user_id
    ) values(
      'fe110000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',2026,'Bad scope',current_date-10,current_date+10,'fe100000-0000-4000-8000-000000000001'
    )$$,
  'Voluntary contribution campaign scope mismatch: school does not belong to tenant',
  'campaign tenant must match school tenant'
);

select lives_ok(
  $$insert into public.voluntary_contribution_campaigns(
      id,tenant_id,school_id,academic_year,title,starts_on,ends_on,status,created_by_user_id
    ) values(
      'fe170000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'Valid campaign',current_date-10,current_date+10,'published','fe100000-0000-4000-8000-000000000001'
    )$$,
  'valid contribution campaign remains allowed'
);

select throws_ok(
  $$insert into public.voluntary_contribution_items(
      tenant_id,school_id,campaign_id,item_type,label
    ) values(
      'fe110000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','fe170000-0000-4000-8000-000000000001','money','Bad item'
    )$$,
  'Voluntary contribution item scope mismatch: campaign does not match tenant and school',
  'item scope must inherit campaign tenant and school'
);

select lives_ok(
  $$insert into public.voluntary_contribution_items(
      id,tenant_id,school_id,campaign_id,item_type,label,suggested_amount
    ) values(
      'fe180000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe170000-0000-4000-8000-000000000001','money','Valid item',100
    )$$,
  'valid contribution item remains allowed'
);

select lives_ok(
  $$insert into public.learner_voluntary_contributions(
      id,tenant_id,school_id,learner_id,enrolment_id,campaign_id,item_id,contribution_date,amount,recorded_by_user_id
    ) values(
      'fe190000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe130000-0000-4000-8000-000000000001','fe140000-0000-4000-8000-000000000001','fe170000-0000-4000-8000-000000000001','fe180000-0000-4000-8000-000000000001',current_date,50,'fe100000-0000-4000-8000-000000000001'
    )$$,
  'valid learner contribution remains allowed'
);

select throws_ok(
  $$insert into public.learner_voluntary_contributions(
      tenant_id,school_id,learner_id,enrolment_id,campaign_id,item_id,contribution_date,amount,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe130000-0000-4000-8000-000000000001','fe140000-0000-4000-8000-000000000002','fe170000-0000-4000-8000-000000000001','fe180000-0000-4000-8000-000000000001',current_date,25,'fe100000-0000-4000-8000-000000000001'
    )$$,
  'Learner voluntary contribution enrolment scope mismatch',
  'contribution enrolment must belong to the recorded learner'
);

select throws_ok(
  $$update public.learner_voluntary_contributions
       set learner_id='fe130000-0000-4000-8000-000000000002'
     where id='fe190000-0000-4000-8000-000000000001'$$,
  'Learner voluntary contribution identity and provenance are immutable',
  'recorded contribution cannot be rebound to another learner'
);

select lives_ok(
  $$update public.learner_voluntary_contributions
       set status='verified',verified_by_user_id='fe100000-0000-4000-8000-000000000002',verified_at=now(),updated_at=now()
     where id='fe190000-0000-4000-8000-000000000001'$$,
  'verification lifecycle remains editable for authorized leadership'
);

select throws_ok(
  $$insert into public.learner_voluntary_contributions(
      tenant_id,school_id,learner_id,enrolment_id,campaign_id,item_id,contribution_date,amount,received_by_staff_member_id,recorded_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fe130000-0000-4000-8000-000000000001','fe140000-0000-4000-8000-000000000001','fe170000-0000-4000-8000-000000000001','fe180000-0000-4000-8000-000000000001',current_date,30,'fe150000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001'
    )$$,
  'Receiving staff member is not actively assigned to contribution school',
  'receiving staff provenance must match the contribution school'
);

select throws_ok(
  $$update public.voluntary_contribution_campaigns set academic_year=2027 where id='fe170000-0000-4000-8000-000000000001'$$,
  'Voluntary contribution campaign scope and provenance are immutable',
  'campaign academic-year identity cannot be rewritten'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_voluntary_contribution_campaign_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_voluntary_contribution_campaign_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_voluntary_contribution_item_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_voluntary_contribution_item_scope_integrity()','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_learner_voluntary_contribution_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_learner_voluntary_contribution_scope_integrity()','EXECUTE')
  and (select count(*) from pg_trigger where tgname in (
    'voluntary_contribution_campaign_scope_integrity_trg',
    'voluntary_contribution_item_scope_integrity_trg',
    'learner_voluntary_contribution_scope_integrity_trg'
  ) and not tgisinternal)=3,
  'voluntary contribution integrity helpers are private and all triggers are installed'
);

select * from finish();
rollback;
