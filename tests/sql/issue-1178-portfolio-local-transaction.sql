\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.subjects(tenant_id,school_id,subject_code,display_name) VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','QA-1178-M','QA Mathematics'),('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','QA-1178-S','QA Science');
INSERT INTO public.staff_members(id,tenant_id,first_name,last_name,employee_number) VALUES ('70000000-0000-4000-8000-000000001178','11111111-1111-4111-8111-111111111111','Test','HOD','QA-1178-HOD'),('70000000-0000-4000-8000-000000001180','11111111-1111-4111-8111-111111111111','Second','HOD','QA-1178-HOD-2');
INSERT INTO public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,effective_from,created_by_user_id) VALUES ('70000000-0000-4000-8000-000000001179','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001178','2026-01-01','70000000-0000-4000-8000-000000000001'),('70000000-0000-4000-8000-000000001181','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001180','2026-01-01','70000000-0000-4000-8000-000000000001');
INSERT INTO public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from) VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000001178','hod','2026-01-01'),('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000001180','hod','2026-02-01');
SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_id uuid; v_appointment uuid; BEGIN
 SELECT public.create_unassigned_hod_portfolio('22222222-2222-4222-8222-222222222222','QA Portfolio 1178',array(select id from public.subjects where subject_code in ('QA-1178-M','QA-1178-S'))) INTO v_id;
 IF (SELECT count(*) FROM public.subject_department_responsibilities WHERE subject_id in (select unnest(subject_ids) FROM public.hod_subject_portfolios WHERE id=v_id))<>0 THEN RAISE EXCEPTION 'Unassigned grants authority'; END IF;
 RAISE NOTICE 'UNASSIGNED CREATED with zero authority';
 SELECT public.appoint_hod_portfolio(v_id,'70000000-0000-4000-8000-000000001179','2026-10-08') INTO v_appointment;
 IF (SELECT count(*) FROM public.subject_department_responsibilities WHERE portfolio_appointment_id=v_appointment)<>2 THEN RAISE EXCEPTION 'Expected two responsibility rows'; END IF;
 RAISE NOTICE 'APPOINTMENT assigned two subject scopes';
 -- A date earlier than the active appointment must not replace or shorten it.
 BEGIN
  PERFORM public.appoint_hod_portfolio(v_id,'70000000-0000-4000-8000-000000001181','2026-10-07');
  RAISE EXCEPTION 'Backdated replacement was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN
  RAISE NOTICE 'BACKDATED_REASSIGNMENT_DENIED';
 END;
 IF (SELECT count(*) FROM public.hod_portfolio_appointments WHERE portfolio_id=v_id)<>1 THEN RAISE EXCEPTION 'Backdated call inserted appointment'; END IF;
 PERFORM public.appoint_hod_portfolio(v_id,'70000000-0000-4000-8000-000000001181','2026-10-20');
 IF (SELECT count(*) FROM public.subject_department_responsibilities WHERE portfolio_appointment_id=v_appointment AND effective_to='2026-10-19')<>2 THEN RAISE EXCEPTION 'Old authority not ended'; END IF;
 IF (SELECT count(*) FROM public.subject_department_responsibilities WHERE portfolio_appointment_id<>(v_appointment) AND effective_from='2026-10-20')<>2 THEN RAISE EXCEPTION 'Successor HOD missing'; END IF;
 IF (SELECT count(*) FROM public.hod_portfolio_appointments WHERE portfolio_id=v_id AND effective_to='2026-10-19')<>1 THEN RAISE EXCEPTION 'Appointment history not preserved'; END IF;
 RAISE NOTICE 'REASSIGNMENT closed prior scope and preserved history';
 IF (SELECT count(*) FROM public.subject_department_responsibilities WHERE portfolio_appointment_id=v_appointment AND effective_to IS NULL)<>0 THEN RAISE EXCEPTION 'Prior HOD retained authority'; END IF;
 IF (SELECT count(*) FROM public.hod_portfolio_appointments WHERE portfolio_id=v_id)<>2 THEN RAISE EXCEPTION 'Missing historical appointment'; END IF;
 RAISE NOTICE 'PRIOR_HOD_AUTHORITY_ENDED';
END $$;
RESET ROLE;
UPDATE public.school_memberships SET active_to='2026-10-07' WHERE user_id='70000000-0000-4000-8000-000000000001' AND role_key='school_admin' AND school_id='22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN
  PERFORM public.create_unassigned_hod_portfolio('22222222-2222-4222-8222-222222222222','HOD self-created portfolio',array(select id from public.subjects where subject_code='QA-1178-M'));
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'HOD-only self-creation permitted'; END IF;
 RAISE NOTICE 'HOD_ONLY_CREATE_DENIED';
 denied:=false;
 BEGIN
  PERFORM public.appoint_hod_portfolio((select id from public.hod_subject_portfolios where label='QA Portfolio 1178'),'70000000-0000-4000-8000-000000001179',date '2026-10-09');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'HOD-only self-appointment permitted'; END IF;
 RAISE NOTICE 'HOD_ONLY_APPOINT_DENIED';
END $$;
ROLLBACK;
