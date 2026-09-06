begin;
select no_plan();
insert into auth.users(id,email,aud,role) values
('cc000000-0000-4000-8000-000000000001','conduct-principal@example.test','authenticated','authenticated'),
('cc000000-0000-4000-8000-000000000002','conduct-counsellor@example.test','authenticated','authenticated'),
('cc000000-0000-4000-8000-000000000003','conduct-teacher@example.test','authenticated','authenticated'),
('cc000000-0000-4000-8000-000000000004','conduct-outsider@example.test','authenticated','authenticated');
insert into public.tenants(id,name,slug) values
('cc100000-0000-4000-8000-000000000001','Conduct tenant A','conduct-a'),
('cc100000-0000-4000-8000-000000000002','Conduct tenant B','conduct-b');
insert into public.schools(id,tenant_id,name) values
('cc200000-0000-4000-8000-000000000001','cc100000-0000-4000-8000-000000000001','Conduct school A'),
('cc200000-0000-4000-8000-000000000002','cc100000-0000-4000-8000-000000000001','Conduct school B'),
('cc200000-0000-4000-8000-000000000003','cc100000-0000-4000-8000-000000000002','Conduct school C');
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','principal',current_date-10),
('cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000002','counsellor',current_date-10),
('cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000003','teacher',current_date-10),
('cc100000-0000-4000-8000-000000000002','cc200000-0000-4000-8000-000000000003','cc000000-0000-4000-8000-000000000004','principal',current_date-10);
insert into public.learners(id,tenant_id,first_names,surname) values
('cc300000-0000-4000-8000-000000000001','cc100000-0000-4000-8000-000000000001','Test','One'),
('cc300000-0000-4000-8000-000000000002','cc100000-0000-4000-8000-000000000001','Test','Two'),
('cc300000-0000-4000-8000-000000000003','cc100000-0000-4000-8000-000000000001','Test','Other school');
insert into public.enrolments(tenant_id,school_id,learner_id,academic_year,enrolled_from,status) values
('cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000001','cc300000-0000-4000-8000-000000000001',extract(year from current_date)::integer,current_date-5,'current'),
('cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000001','cc300000-0000-4000-8000-000000000002',extract(year from current_date)::integer,current_date-5,'current'),
('cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000002','cc300000-0000-4000-8000-000000000003',extract(year from current_date)::integer,current_date-5,'current');
insert into public.conduct_policy_categories(id,tenant_id,school_id,domain,direction,code,display_name,default_severity) values
('cc400000-0000-4000-8000-000000000001','cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000001','conduct','negative','NEG','Original policy','moderate'),
('cc400000-0000-4000-8000-000000000002','cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000001','conduct','positive','POS','Positive policy',null),
('cc400000-0000-4000-8000-000000000003','cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000001','achievement',null,'AWARD','Award',null),
('cc400000-0000-4000-8000-000000000004','cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000002','conduct','negative','OTHER','Other school',null);
-- Trusted legacy history stays readable without pretending its code is approved policy.
insert into public.conduct_events(tenant_id,school_id,learner_id,occurred_on,direction,category_code,summary,recorded_by_user_id)
values('cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000001','cc300000-0000-4000-8000-000000000001',current_date,'negative','LEGACY','Legacy event','cc000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','cc000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000001',null,'Group event',null,current_date,array['cc300000-0000-4000-8000-000000000001','cc300000-0000-4000-8000-000000000002','cc300000-0000-4000-8000-000000000001']::uuid[])$$,'principal records an atomic deduplicated group');
select is((select count(*)::integer from public.conduct_events where summary='Group event'),2,'one event per distinct learner');
select is((select count(distinct event_group_id)::integer from public.conduct_events where summary='Group event'),1,'group shares one identifier');
select ok((select bool_and(recorded_by_user_id=auth.uid() and category_code='NEG' and severity='moderate') from public.conduct_events where summary='Group event'),'category defaults and recorder come from authoritative context');
select lives_ok($$select public.create_achievement_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000003','Achievement group','Shared success','school',current_date,array['cc300000-0000-4000-8000-000000000001','cc300000-0000-4000-8000-000000000002']::uuid[])$$,'principal records an achievement group');
select is((select count(*)::integer from public.achievement_events where title='Achievement group'),2,'achievement group retains one row per learner');
select throws_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000001',null,'Empty',null,current_date,'{}')$$,'Choose between 1 and 200 learners','empty groups rejected');
select throws_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000004',null,'Other category',null,current_date,array['cc300000-0000-4000-8000-000000000001']::uuid[])$$,'Category is not active in this school and domain','same tenant other-school category rejected');
select throws_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000003',null,'Wrong domain',null,current_date,array['cc300000-0000-4000-8000-000000000001']::uuid[])$$,'Category is not active in this school and domain','achievement category cannot record incident');
select throws_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000001',null,'Rollback event',null,current_date,array['cc300000-0000-4000-8000-000000000001','cc300000-0000-4000-8000-000000000003']::uuid[])$$,'Learner is not enrolled in this school on the event date','mixed school group rejected');
select is((select count(*)::integer from public.conduct_events where summary='Rollback event'),0,'failed group rolls back earlier learners');
select throws_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000001',null,'Before enrolment',null,current_date-10,array['cc300000-0000-4000-8000-000000000001']::uuid[])$$,'Learner is not enrolled in this school on the event date','event date must fall within enrolment');
select lives_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000002','critical','Positive event',null,current_date,array['cc300000-0000-4000-8000-000000000001']::uuid[])$$,'positive incident can be recorded');
select ok((select severity='routine' and event_group_id is null from public.conduct_events where summary='Positive event'),'positive singleton has neutral severity and no group');
select lives_ok($$select public.upsert_conduct_policy_category('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000001','conduct','positive','NEG','Renamed policy',null,10,1,true)$$,'principal edits policy');
select ok((select bool_and(category_snapshot->>'display_name'='Original policy' and direction='negative') from public.conduct_events where summary='Group event'),'policy edit does not rewrite historical meaning');
select throws_ok($$update public.conduct_events set category_snapshot='{"display_name":"Rewritten"}' where summary='Group event'$$,'Event policy provenance is immutable','leaders cannot rewrite frozen event policy provenance');
select lives_ok($$select public.retire_conduct_policy_category('cc400000-0000-4000-8000-000000000001')$$,'principal archives category');
select throws_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000001',null,'Archived',null,current_date,array['cc300000-0000-4000-8000-000000000001']::uuid[])$$,'Category is not active in this school and domain','archived category cannot receive new events');
select is(jsonb_array_length(public.list_conduct_history('cc200000-0000-4000-8000-000000000001','conduct')->'events'),4,'legacy and archived events remain readable');
select is(jsonb_array_length(public.list_conduct_history('cc200000-0000-4000-8000-000000000001','conduct','cc300000-0000-4000-8000-000000000002')->'events'),1,'learner filter does not expose other group members');
select ok(not has_table_privilege('authenticated','public.conduct_policy_categories','INSERT,UPDATE,DELETE'),'clients cannot bypass policy management RPCs');
select ok(not has_function_privilege('anon','public.create_conduct_event_group(uuid,uuid,text,text,text,date,uuid[])','EXECUTE'),'anonymous cannot execute recorder');
select ok(not has_function_privilege('authenticated','app_private.record_conduct_group(uuid,uuid,text,date,text,text,text,text,uuid[])','EXECUTE'),'shared implementation is private');

select set_config('request.jwt.claim.sub','cc000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000002',null,'Counsellor note',null,current_date,array['cc300000-0000-4000-8000-000000000001']::uuid[])$$,'counsellor may record incidents');
select throws_ok($$select public.create_achievement_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000003','Award',null,'school',current_date,array['cc300000-0000-4000-8000-000000000001']::uuid[])$$,'42501','Permission denied','counsellor cannot record achievements');
select throws_ok($$select public.retire_conduct_policy_category('cc400000-0000-4000-8000-000000000002')$$,'42501','Permission denied','counsellor cannot manage policy');
select set_config('request.jwt.claim.sub','cc000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.list_conduct_learners('cc200000-0000-4000-8000-000000000001',current_date)),0,'unassigned teacher has no roster');
select is(jsonb_array_length(public.list_conduct_history('cc200000-0000-4000-8000-000000000001','conduct')->'events'),0,'unassigned teacher has no event history');
select throws_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000002',null,'Out of scope',null,current_date,array['cc300000-0000-4000-8000-000000000001']::uuid[])$$,'42501','Learner is outside your conduct scope','RPC cannot bypass assignment scope');
select set_config('request.jwt.claim.sub','cc000000-0000-4000-8000-000000000004',true);
select is((select count(*)::integer from public.conduct_policy_categories),0,'other tenant cannot read categories');
select is(jsonb_array_length(public.list_conduct_history('cc200000-0000-4000-8000-000000000001','conduct')->'events'),0,'other tenant cannot read events');
select throws_ok($$select public.create_conduct_event_group('cc200000-0000-4000-8000-000000000001','cc400000-0000-4000-8000-000000000002',null,'Other tenant',null,current_date,array['cc300000-0000-4000-8000-000000000001']::uuid[])$$,'42501','Permission denied','other tenant cannot create events');
reset role;
select * from finish();
rollback;
