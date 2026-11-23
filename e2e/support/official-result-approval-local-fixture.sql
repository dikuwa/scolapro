-- Disposable local Supabase only. Applied by official-result-approval-lifecycle.spec.ts
-- through loopback PostgreSQL as the trusted fixture owner. Not a migration,
-- production seed, official curriculum, or default grading scheme.
begin;

-- Isolated synthetic school-year governance: the term closing date is the
-- fixed reference date even if approval or correction happens months later.
insert into public.academic_years(tenant_id,school_id,year,starts_on,ends_on)
values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'2026-01-05','2026-12-15')
on conflict (school_id,year) do nothing;

insert into public.academic_terms(
 tenant_id,school_id,academic_year_id,term_number,display_name,starts_on,ends_on
)
select '11111111-1111-4111-8111-111111111111',
       '22222222-2222-4222-8222-222222222222',year.id,1,
       'Synthetic Term 1','2026-01-05','2026-04-10'
from public.academic_years year
where year.school_id='22222222-2222-4222-8222-222222222222' and year.year=2026
on conflict (academic_year_id,term_number) do nothing;

insert into public.subjects(id,tenant_id,school_id,subject_code,display_name,status)
values('e2f10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','E2E-APP','E2E Approval Science','active')
on conflict (id) do nothing;

insert into public.subject_offerings(id,tenant_id,school_id,academic_year,subject_id,grade_id,periods_per_cycle,status)
values('e2f20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,'e2f10000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010',4,'active')
on conflict (id) do nothing;

insert into public.assessment_schemes(
  id,tenant_id,school_id,subject_offering_id,scheme_key,version,capture_mode,effective_from,status,created_by_user_id
) values('e2f30000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'e2f20000-0000-4000-8000-000000000001','E2E-APP','v1','detailed','2026-01-05','active','70000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.assessment_components(
  id,tenant_id,school_id,assessment_scheme_id,component_code,display_name,component_type,raw_max,weight,required,contributes_to_report,sort_order
) values('e2f40000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'e2f30000-0000-4000-8000-000000000001','TASK','E2E Approval Task','task',100,100,true,true,1)
on conflict (id) do nothing;

insert into public.teacher_allocations(
 id,tenant_id,school_id,academic_year,subject_offering_id,register_class_id,staff_member_id,active_from
) values('e2f50000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
'e2f20000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000001b','e2e10000-0000-4000-8000-000000000001','2026-01-05')
on conflict (id) do nothing;

insert into public.learner_subject_registrations(
 id,tenant_id,school_id,academic_year,enrolment_id,learner_id,subject_offering_id,status,source,registered_by_user_id
) values('e2f70000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
'60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','e2f20000-0000-4000-8000-000000000001','active','test',
'70000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.assessment_instances(
 id,tenant_id,school_id,academic_year,assessment_scheme_id,assessment_component_id,subject_offering_id,
 register_class_id,teacher_allocation_id,term_number,display_name,raw_max,status,created_by_user_id
) values('e2f60000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',2026,
'e2f30000-0000-4000-8000-000000000001','e2f40000-0000-4000-8000-000000000001','e2f20000-0000-4000-8000-000000000001',
'40000000-0000-4000-8000-00000000001b','e2f50000-0000-4000-8000-000000000001',1,'E2E Approval Task',100,'open',
'70000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.subject_department_responsibilities(
 id,tenant_id,school_id,subject_id,department_head_staff_assignment_id,effective_from,created_by_user_id
) values('e2fa0000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'e2f10000-0000-4000-8000-000000000001','e2e30000-0000-4000-8000-000000000003','2026-01-05',
'70000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.grading_scales(
 id,tenant_id,school_id,scale_key,version,display_name,effective_from,status,created_by_user_id
) values('e2f80000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'E2E-ONLY','v1','E2E Synthetic Approval Scale','2026-01-05','active','70000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.grading_scale_bands(
 id,tenant_id,school_id,grading_scale_id,minimum_value,maximum_value,symbol,sort_order
) values('e2f90000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'e2f80000-0000-4000-8000-000000000001',0,100,'A',1)
on conflict (id) do nothing;


-- An active but future-effective synthetic version must be refused for
-- Term 1 2026 even if management can see/select it.
insert into public.grading_scales(
 id,tenant_id,school_id,scale_key,version,display_name,effective_from,status,created_by_user_id
) values('e2f80000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'E2E-FUTURE','v1','E2E Future-Only Scale','2027-01-01','active','70000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.grading_scale_bands(
 id,tenant_id,school_id,grading_scale_id,minimum_value,maximum_value,symbol,sort_order
) values('e2f90000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'e2f80000-0000-4000-8000-000000000002',0,100,'Z',1)
on conflict (id) do nothing;

commit;
