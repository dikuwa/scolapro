begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('fd800000-0000-4000-8000-000000000001','grading-usage-approver@example.test','authenticated','authenticated',now(),now());

insert into public.schools(id,tenant_id,name,emis_number,status)
values ('fd810000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Grading Usage School','TST-GRD-USE','active');

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values ('11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001','fd800000-0000-4000-8000-000000000001','school_admin',current_date-10);

insert into public.grades(id,tenant_id,school_id,grade_code,display_name,academic_year)
values ('fd820000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001','08','Grade 8',2026);

insert into public.learners(id,tenant_id,first_names,surname)
values ('fd830000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Usage','Learner');

insert into public.enrolments(id,tenant_id,school_id,learner_id,academic_year,grade_id,enrolled_from,status)
values ('fd840000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001','fd830000-0000-4000-8000-000000000001',2026,'fd820000-0000-4000-8000-000000000001',current_date-30,'current');

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name)
values ('fd850000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001','USAGE01','Usage Subject');

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id)
values ('fd860000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001',2026,'fd850000-0000-4000-8000-000000000001','fd820000-0000-4000-8000-000000000001');

-- Legacy state: a used scale that is still a draft. This could exist because the
-- governed configuration guard arrived after the scale had already been used.
insert into public.grading_scales(
  id,tenant_id,school_id,scale_key,version,display_name,effective_from,decimal_places,status,created_by_user_id
) values (
  'fd870000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001',
  'LEGACY','v1','Legacy Draft Scale',current_date-60,0,'draft','fd800000-0000-4000-8000-000000000001'
);

insert into public.grading_scale_bands(
  id,tenant_id,school_id,grading_scale_id,minimum_value,maximum_value,symbol,pass_classification,sort_order
) values (
  'fd880000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001',
  'fd870000-0000-4000-8000-000000000001',0,100,'A','pass',0
);

select lives_ok(
  $$insert into public.official_results(
      id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,term_number,
      result_value,symbol,assessment_scheme_key,assessment_scheme_version,
      grading_scale_key,grading_scale_version,approved_by_user_id
    ) values (
      'fd890000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001',2026,
      'fd840000-0000-4000-8000-000000000001','fd830000-0000-4000-8000-000000000001','fd860000-0000-4000-8000-000000000001',1,
      82,'A','USAGE-SCHEME','v1','LEGACY','v1','fd800000-0000-4000-8000-000000000001'
    )$$,
  'an approved result can reference a legacy grading-scale version'
);

select throws_ok(
  $$update public.grading_scales
      set display_name='Legacy Draft Scale Renamed'
      where id='fd870000-0000-4000-8000-000000000001'$$,
  'A grading scale used by approved results is immutable; create a new version',
  'a used scale cannot change its definition even while the row is still a draft'
);

select throws_ok(
  $$insert into public.grading_scale_bands(
      id,tenant_id,school_id,grading_scale_id,minimum_value,maximum_value,symbol,pass_classification,sort_order
    ) values (
      'fd880000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001',
      'fd870000-0000-4000-8000-000000000001',0,100,'B','pass',1
    )$$,
  'Bands of a grading scale used by approved results are immutable; create a new version',
  'bands of a used scale cannot change even while the scale is still a draft'
);

select throws_ok(
  $$delete from public.grading_scales where id='fd870000-0000-4000-8000-000000000001'$$,
  'A grading scale used by approved results cannot be deleted',
  'a used grading scale cannot be deleted'
);

select throws_ok(
  $$insert into public.grading_scales(
      id,tenant_id,school_id,scale_key,version,display_name,effective_from,decimal_places,status,created_by_user_id
    ) values (
      'fd870000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','fd810000-0000-4000-8000-000000000001',
      'LEGACY','v1','Legacy Draft Recreated',current_date-60,0,'draft','fd800000-0000-4000-8000-000000000001'
    )$$,
  'A grading scale version already used by approved results cannot be recreated as a draft',
  'a draft shadow of a used version cannot be recreated'
);

select * from finish();
rollback;
