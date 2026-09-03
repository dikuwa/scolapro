begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values(
  'fdd00000-0000-4000-8000-000000000001',
  'parent-current-enrolment@example.test',
  'authenticated','authenticated',now(),now()
);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values(
  'fdd10000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Current','Guardian','active'
);

insert into public.guardian_user_links(tenant_id,guardian_id,user_id)
values(
  '11111111-1111-4111-8111-111111111111',
  'fdd10000-0000-4000-8000-000000000001',
  'fdd00000-0000-4000-8000-000000000001'
);

insert into public.learners(id,tenant_id,first_names,surname)
values(
  'fdd20000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'Future','Learner'
);

insert into public.learner_guardians(
  tenant_id,learner_id,guardian_id,relationship_type,effective_from
) values(
  '11111111-1111-4111-8111-111111111111',
  'fdd20000-0000-4000-8000-000000000001',
  'fdd10000-0000-4000-8000-000000000001',
  'guardian',current_date-30
);

-- A learner may have one current enrolment in each academic year. The next-year row is
-- deliberately status='current' but must not become the parent portal's present school
-- until its own enrolled_from date arrives.
insert into public.enrolments(
  id,tenant_id,school_id,learner_id,academic_year,admission_number,enrolled_from,enrolled_to,status
) values
  (
    'fdd30000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fdd20000-0000-4000-8000-000000000001',
    extract(year from current_date)::integer,
    'PARENT-CURRENT-001',current_date-120,current_date+30,'current'
  ),
  (
    'fdd30000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fdd20000-0000-4000-8000-000000000001',
    extract(year from current_date)::integer+1,
    'PARENT-FUTURE-001',current_date+60,null,'current'
  );

insert into public.voluntary_contribution_campaigns(
  id,tenant_id,school_id,academic_year,title,starts_on,ends_on,status,
  visible_to_guardians,created_by_user_id
) values
  (
    'fdd40000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    extract(year from current_date)::integer,
    'Current Campaign',current_date-7,current_date+7,'published',true,
    'fdd00000-0000-4000-8000-000000000001'
  ),
  (
    'fdd40000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    extract(year from current_date)::integer+1,
    'Future Placement Campaign',current_date-7,current_date+7,'published',true,
    'fdd00000-0000-4000-8000-000000000001'
  );

insert into public.voluntary_contribution_items(
  id,tenant_id,school_id,campaign_id,item_type,label,active
) values
  (
    'fdd50000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fdd40000-0000-4000-8000-000000000001','money','Current item',true
  ),
  (
    'fdd50000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'fdd40000-0000-4000-8000-000000000002','money','Future item',true
  );

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdd00000-0000-4000-8000-000000000001',true);

select is(
  public.get_parent_family_overview()->'children'->0->>'enrolment_id',
  'fdd30000-0000-4000-8000-000000000001',
  'parent family overview keeps the enrolment that is actually effective today'
);

select is(
  (public.get_parent_family_overview()->'children'->0->>'academic_year')::integer,
  extract(year from current_date)::integer,
  'future next-year current-status enrolment does not replace the present academic year'
);

select is(
  (select count(*)::integer
   from public.get_my_children_voluntary_contributions()
   where campaign_id='fdd40000-0000-4000-8000-000000000001'),
  1,
  'guardian sees the campaign connected to the enrolment effective today'
);

select is(
  (select count(*)::integer
   from public.get_my_children_voluntary_contributions()
   where campaign_id='fdd40000-0000-4000-8000-000000000002'),
  0,
  'guardian cannot see a campaign solely through a future-start enrolment'
);

select is(
  (select count(*)::integer from public.get_my_children_voluntary_contributions()),
  1,
  'future-start enrolment does not duplicate the child contribution feed'
);

select * from finish();
rollback;
