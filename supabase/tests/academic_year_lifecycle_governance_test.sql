begin;

select plan(6);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fd000000-0000-4000-8000-000000000001','year-admin@example.test','authenticated','authenticated',now(),now());
insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd000000-0000-4000-8000-000000000001','school_admin',current_date);

insert into public.academic_years(id,tenant_id,school_id,year,status,starts_on,ends_on) values
('fd100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'setup','2026-01-12','2026-12-04'),
('fd100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'setup','2027-01-13','2027-12-03');

insert into public.grades(id,tenant_id,school_id,academic_year,grade_code,display_name)
values('fd200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2027,'10','Grade 10');
insert into public.register_classes(id,tenant_id,school_id,grade_id,academic_year,class_code,display_name)
values('fd300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fd200000-0000-4000-8000-000000000001',2027,'10A-2027','10A');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok($$select public.activate_academic_year('fd100000-0000-4000-8000-000000000001')$$,'configured academic year can be activated');
select is((select status from public.academic_years where id='fd100000-0000-4000-8000-000000000001'),'active','activation persists governed active status');
select throws_ok($$select public.activate_academic_year('fd100000-0000-4000-8000-000000000002')$$,'Another academic year is already active for this school','school cannot have two active academic years');
select throws_like($$select public.close_academic_year('fd100000-0000-4000-8000-000000000001')$$,'%learner enrolment(s) remain current%','year cannot close while learners remain current');

update public.enrolments set status='completed',enrolled_to='2026-12-04' where school_id='22222222-2222-4222-8222-222222222222' and academic_year=2026 and status='current';

select lives_ok($$select public.close_academic_year('fd100000-0000-4000-8000-000000000001')$$,'year closes after all learner enrolments are resolved');
select is((select status from public.academic_years where id='fd100000-0000-4000-8000-000000000001'),'closed','closed year remains historically closed');

select * from finish();
rollback;