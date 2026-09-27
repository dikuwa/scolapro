begin;
select no_plan();

insert into auth.users(id,email,aud,role) values
('d5000000-0000-4000-8000-000000000001','conduct-manage-hod@example.test','authenticated','authenticated'),
('d5000000-0000-4000-8000-000000000002','conduct-manage-outsider@example.test','authenticated','authenticated');

insert into public.tenants(id,name,slug) values
('d5100000-0000-4000-8000-000000000001','Conduct Management Tenant','conduct-management');

insert into public.schools(id,tenant_id,name,status) values
('d5200000-0000-4000-8000-000000000001','d5100000-0000-4000-8000-000000000001','Conduct Management School','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('d5100000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','hod',current_date-10);

insert into public.learners(id,tenant_id,first_names,surname) values
('d5300000-0000-4000-8000-000000000001','d5100000-0000-4000-8000-000000000001','Manage','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('d5400000-0000-4000-8000-000000000001','d5100000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','d5300000-0000-4000-8000-000000000001',extract(year from current_date)::integer,current_date-20,'current');

insert into public.conduct_events(
  tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,
  severity,summary,category_snapshot,recorded_by_user_id
) values
(
  'd5100000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','d5300000-0000-4000-8000-000000000001','d5400000-0000-4000-8000-000000000001',
  current_date-4,'positive','REC_HELP','routine','Helpfulness',
  '{"display_name":"Helpfulness","points":3,"requires_management_attention":false,"group":{"display_name":"General","type":"recognition"}}'::jsonb,
  'd5000000-0000-4000-8000-000000000001'
),
(
  'd5100000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','d5300000-0000-4000-8000-000000000001','d5400000-0000-4000-8000-000000000001',
  current_date-3,'negative','VIO_FIGHT','serious','Fighting / instigating',
  '{"display_name":"Fighting / instigating","points":-3,"requires_management_attention":true,"group":{"display_name":"Level 2","type":"violation"}}'::jsonb,
  'd5000000-0000-4000-8000-000000000001'
),
(
  'd5100000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','d5300000-0000-4000-8000-000000000001','d5400000-0000-4000-8000-000000000001',
  current_date-2,'negative','VIO_LANGUAGE','moderate','Abusive language',
  '{"display_name":"Abusive language","points":-3,"requires_management_attention":false,"group":{"display_name":"Level 2","type":"violation"}}'::jsonb,
  'd5000000-0000-4000-8000-000000000001'
),
(
  'd5100000-0000-4000-8000-000000000001','d5200000-0000-4000-8000-000000000001','d5300000-0000-4000-8000-000000000001','d5400000-0000-4000-8000-000000000001',
  current_date-1,'negative','VIO_DISRUPT','moderate','Disruptive behaviour',
  '{"display_name":"Disruptive behaviour","points":-3,"requires_management_attention":false,"group":{"display_name":"Level 2","type":"violation"}}'::jsonb,
  'd5000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d5000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.get_conduct_management_view(
    'd5200000-0000-4000-8000-000000000001',
    extract(year from current_date)::integer,'',null,null,false,false,0
  )$$,
  'HOD can open current-school Conduct management'
);

select is(
  (public.get_conduct_management_view(
    'd5200000-0000-4000-8000-000000000001',
    extract(year from current_date)::integer,'',null,null,false,false,0
  )#>>'{summary,recognition_count}')::integer,
  1,
  'management summary counts Recognition'
);

select is(
  (public.get_conduct_management_view(
    'd5200000-0000-4000-8000-000000000001',
    extract(year from current_date)::integer,'',null,null,false,false,0
  )#>>'{summary,violation_count}')::integer,
  3,
  'management summary counts Violations'
);

select is(
  (public.get_conduct_management_view(
    'd5200000-0000-4000-8000-000000000001',
    extract(year from current_date)::integer,'',null,null,false,false,0
  )#>>'{summary,attention_event_count}')::integer,
  1,
  'management attention comes from snapshotted policy metadata'
);

select is(
  (public.get_conduct_management_view(
    'd5200000-0000-4000-8000-000000000001',
    extract(year from current_date)::integer,'',null,null,false,false,0
  )#>>'{summary,learners_with_repeated_patterns}')::integer,
  1,
  'three violations in one policy group create a repeated-pattern review indicator'
);

select is(
  (public.get_conduct_management_view(
    'd5200000-0000-4000-8000-000000000001',
    extract(year from current_date)::integer,'',null,null,true,false,0
  )#>>'{learners,0,learner_name}'),
  'Manage Learner',
  'attention-only filter returns the matching learner'
);

select ok(
  jsonb_array_length(
    public.get_conduct_management_view(
      'd5200000-0000-4000-8000-000000000001',
      extract(year from current_date)::integer,'',null,null,false,false,0
    )->'policyUsage'
  ) >= 1,
  'policy usage analytics derive from immutable event snapshots'
);

select set_config('request.jwt.claim.sub','d5000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.get_conduct_management_view(
    'd5200000-0000-4000-8000-000000000001',
    extract(year from current_date)::integer,'',null,null,false,false,0
  )$$,
  '42501',
  'Permission denied',
  'non-current-school outsider cannot read Conduct management'
);

select ok(
  not has_function_privilege('authenticated','app_private.can_view_conduct_management(uuid)','EXECUTE'),
  'management authority helper remains private'
);

reset role;
select * from finish();
rollback;
