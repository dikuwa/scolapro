\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email,aud,role,created_at,updated_at)
VALUES ('70000000-0000-4000-8000-000000000202','qa1202-admin@example.test','authenticated','authenticated',now(),now());
INSERT INTO public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'70000000-0000-4000-8000-000000000202','school_admin','2026-01-01');
INSERT INTO public.staff_members(id,tenant_id,first_name,last_name,employee_number)
VALUES ('70000000-0000-4000-8000-000000001202','11111111-1111-4111-8111-111111111111','Future','Teacher','QA-1202');
INSERT INTO public.staff_school_assignments(id,tenant_id,school_id,staff_member_id,effective_from,created_by_user_id)
VALUES ('70000000-0000-4000-8000-000000002202','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001202','2026-01-01','70000000-0000-4000-8000-000000000202');
SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000202',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a uuid; b uuid; BEGIN
  a:=public.plan_staff_school_role('22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001202','teacher','2026-01-01');
  b:=public.plan_staff_school_role('22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001202','librarian','2026-01-01');
  IF (SELECT count(*) FROM public.list_staff_planned_roles('22222222-2222-4222-8222-222222222222',array['70000000-0000-4000-8000-000000001202']::uuid[]))<>2 THEN
    RAISE EXCEPTION 'Expected two preassigned roles'; END IF;
  IF EXISTS (SELECT 1 FROM public.school_memberships WHERE staff_member_id='70000000-0000-4000-8000-000000001202') THEN
    RAISE EXCEPTION 'Planning manufactured active login authority'; END IF;
  RAISE NOTICE 'TWO_ROLES_NO_LOGIN_ACCESS';
  BEGIN
    PERFORM public.plan_staff_school_role('22222222-2222-4222-8222-222222222222','70000000-0000-4000-8000-000000001202','teacher','2026-01-01');
    RAISE EXCEPTION 'Duplicate planned role permitted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Planned role interval overlaps%' THEN RAISE; END IF;
    RAISE NOTICE 'OVERLAPPING_ROLE_DENIED';
  END;
  PERFORM public.end_planned_staff_school_role('22222222-2222-4222-8222-222222222222',b,'2026-10-09');
  IF (SELECT effective_to FROM public.list_staff_planned_roles('22222222-2222-4222-8222-222222222222',array['70000000-0000-4000-8000-000000001202']::uuid[]) WHERE id=b)<>date '2026-10-09' THEN
    RAISE EXCEPTION 'Planned role end failed'; END IF;
  RAISE NOTICE 'PLANNED_ROLE_END_AUDITED';
END $$;
ROLLBACK;
