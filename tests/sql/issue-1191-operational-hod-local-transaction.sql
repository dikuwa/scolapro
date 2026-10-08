\set ON_ERROR_STOP on
-- Run against an isolated, seeded Supabase db ONLY. Everything rolls back.
BEGIN;
INSERT INTO public.subjects(tenant_id,school_id,subject_code,display_name)
VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','QA-1191-M','QA no-login Mathematics');
INSERT INTO public.staff_members(id,tenant_id,first_name,last_name,employee_number)
VALUES ('70000000-0000-4000-8000-000000001191','11111111-1111-4111-8111-111111111111','Uninvited','HOD','QA-1191-HOD');
INSERT INTO public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,effective_from,created_by_user_id)
VALUES ('70000000-0000-4000-8000-000000001192','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001191','2026-01-01','70000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_designation uuid; v_port uuid; v_appointment uuid; BEGIN
 SELECT public.designate_staff_operational_hod('22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001191','2026-10-08') INTO v_designation;
 IF (select user_id from public.staff_members where id='70000000-0000-4000-8000-000000001191') IS NOT NULL THEN
   RAISE EXCEPTION 'Designation manufactured a linked account'; END IF;
 IF exists(select 1 from public.school_memberships where staff_member_id='70000000-0000-4000-8000-000000001191') THEN
   RAISE EXCEPTION 'Designation manufactured a school membership'; END IF;
 RAISE NOTICE 'NO_LOGIN_DESIGNATION_CREATED';
 BEGIN
  PERFORM public.designate_staff_operational_hod('22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001191','2026-10-08');
  RAISE EXCEPTION 'Duplicate open designation permitted';
 EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'DUPLICATE_OPEN_DESIGNATION_DENIED'; END;
 SELECT public.create_unassigned_hod_portfolio('22222222-2222-4222-8222-222222222222','QA 1191 portfolio',
   array(select id from public.subjects where subject_code='QA-1191-M')) INTO v_port;
 SELECT public.appoint_hod_portfolio(v_port,'70000000-0000-4000-8000-000000001192','2026-10-08') INTO v_appointment;
 IF (select count(*) from public.subject_department_responsibilities where portfolio_appointment_id=v_appointment)<>1 THEN
  RAISE EXCEPTION 'Operational HOD appointment did not generate source authority'; END IF;
 RAISE NOTICE 'NO_LOGIN_HOD_APPOINTED';
 PERFORM public.end_staff_operational_hod('22222222-2222-4222-8222-222222222222',v_designation,'2026-10-20');
 IF exists(select 1 from public.subject_department_responsibilities where portfolio_appointment_id=v_appointment AND effective_to IS NULL)
 OR (select effective_to from public.hod_portfolio_appointments where id=v_appointment)<>date '2026-10-20' THEN
  RAISE EXCEPTION 'HOD authority not closed on designation end'; END IF;
 RAISE NOTICE 'AUTHORITY_ENDED_HISTORY_RETAINED';
END $$;
ROLLBACK;
