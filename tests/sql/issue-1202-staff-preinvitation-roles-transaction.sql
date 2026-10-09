\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at)
VALUES
  ('70000000-0000-4000-8000-000000000202','qa1202-admin@example.test',now(),'authenticated','authenticated',now(),now()),
  ('70000000-0000-4000-8000-000000000203','qa1202-invitee@example.test',now(),'authenticated','authenticated',now(),now());

INSERT INTO public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000000202',
  'school_admin',
  current_date-30
);

INSERT INTO public.staff_members(id,tenant_id,first_name,last_name,employee_number)
VALUES (
  '70000000-0000-4000-8000-000000001202',
  '11111111-1111-4111-8111-111111111111',
  'Future','Teacher','QA-1202'
);

INSERT INTO public.staff_school_assignments(
  id,tenant_id,school_id,staff_member_id,effective_from,created_by_user_id
)
VALUES (
  '70000000-0000-4000-8000-000000002202',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000001202',
  current_date-30,
  '70000000-0000-4000-8000-000000000202'
);

SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000202',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims',
  jsonb_build_object(
    'sub','70000000-0000-4000-8000-000000000202',
    'role','authenticated',
    'email','qa1202-admin@example.test'
  )::text,true);
SET LOCAL ROLE authenticated;

DO $
BEGIN
  BEGIN
    PERFORM public.end_staff_school_role(
      '22222222-2222-4222-8222-222222222222',
      (SELECT id FROM public.school_memberships
       WHERE school_id='22222222-2222-4222-8222-222222222222'
         AND user_id='70000000-0000-4000-8000-000000000202'
         AND role_key='school_admin'),
      current_date-1
    );
    RAISE EXCEPTION 'Last School Admin removal was permitted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Cannot remove the last active School Admin' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'LAST_SCHOOL_ADMIN_PROTECTED';
END $;

SELECT public.plan_staff_school_role(
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000001202',
  'teacher',current_date-10
) AS teacher_plan \gset

SELECT public.plan_staff_school_role(
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000001202',
  'librarian',current_date
) AS librarian_plan \gset

SELECT public.plan_staff_school_role(
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000001202',
  'principal',current_date+7
) AS scheduled_plan \gset

SELECT public.plan_staff_school_role(
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000001202',
  'social_worker',current_date
) AS revoked_plan \gset

SELECT public.end_planned_staff_school_role(
  '22222222-2222-4222-8222-222222222222',
  :'revoked_plan'::uuid,current_date
);

SELECT invitation_token
FROM public.create_staff_access_invitation(
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000001202',
  'qa1202-invitee@example.test',
  'teacher'
) \gset

RESET ROLE;

UPDATE public.staff_planned_school_roles
SET effective_to=current_date+30
WHERE id=:'teacher_plan'::uuid;

INSERT INTO public.staff_planned_school_roles(
  id,tenant_id,school_id,staff_member_id,role_key,effective_from,effective_to,created_by_user_id
) VALUES (
  '70000000-0000-4000-8000-000000003202',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '70000000-0000-4000-8000-000000001202',
  'counsellor',current_date-20,current_date-1,
  '70000000-0000-4000-8000-000000000202'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE staff_member_id='70000000-0000-4000-8000-000000001202'
  ) THEN
    RAISE EXCEPTION 'Planning manufactured active login authority';
  END IF;
  RAISE NOTICE 'NO_LOGIN_ACCESS_BEFORE_ACCEPTANCE';
END $$;

SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000203',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims',
  jsonb_build_object(
    'sub','70000000-0000-4000-8000-000000000203',
    'role','authenticated',
    'email','qa1202-invitee@example.test'
  )::text,true);
SET LOCAL ROLE authenticated;

SELECT * FROM public.accept_school_invitation(:'invitation_token');

RESET ROLE;

DO $$
BEGIN
  IF (SELECT user_id FROM public.staff_members
      WHERE id='70000000-0000-4000-8000-000000001202')
      <> '70000000-0000-4000-8000-000000000203'::uuid THEN
    RAISE EXCEPTION 'Staff identity was not linked to accepting Auth user';
  END IF;

  IF (SELECT count(*) FROM public.school_memberships
      WHERE staff_member_id='70000000-0000-4000-8000-000000001202') <> 3 THEN
    RAISE EXCEPTION 'Expected exactly teacher, librarian and scheduled principal memberships';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE staff_member_id='70000000-0000-4000-8000-000000001202'
      AND role_key='teacher'
      AND active_from=current_date-10
      AND active_to=current_date+30
  ) THEN
    RAISE EXCEPTION 'Teacher effective interval was not preserved';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE staff_member_id='70000000-0000-4000-8000-000000001202'
      AND role_key='principal'
      AND active_from=current_date+7
  ) THEN
    RAISE EXCEPTION 'Scheduled role did not preserve its future effective date';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE staff_member_id='70000000-0000-4000-8000-000000001202'
      AND role_key IN ('social_worker','counsellor')
  ) THEN
    RAISE EXCEPTION 'Revoked or expired planned role was activated';
  END IF;

  IF (SELECT count(*) FROM public.staff_planned_school_roles
      WHERE staff_member_id='70000000-0000-4000-8000-000000001202'
        AND role_key IN ('teacher','librarian','principal')
        AND linked_user_id='70000000-0000-4000-8000-000000000203'
        AND linked_at IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'Eligible plans were not linked atomically';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.staff_planned_school_roles
    WHERE staff_member_id='70000000-0000-4000-8000-000000001202'
      AND role_key IN ('social_worker','counsellor')
      AND linked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Revoked or expired plan was marked linked';
  END IF;

  RAISE NOTICE 'MULTI_ROLE_EFFECTIVE_DATES_REVOKED_EXPIRED_SCHEDULED_OK';
END $$;

SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000203',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims',
  jsonb_build_object(
    'sub','70000000-0000-4000-8000-000000000203',
    'role','authenticated',
    'email','qa1202-invitee@example.test'
  )::text,true);
SET LOCAL ROLE authenticated;

SELECT * FROM public.accept_school_invitation(:'invitation_token');

RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.school_memberships
      WHERE staff_member_id='70000000-0000-4000-8000-000000001202') <> 3 THEN
    RAISE EXCEPTION 'Invitation replay duplicated role authority';
  END IF;
  IF (SELECT count(*) FROM public.audit_events
      WHERE event_type='staff.planned_role_activated'
        AND entity_id IN (
          SELECT id FROM public.school_memberships
          WHERE staff_member_id='70000000-0000-4000-8000-000000001202'
        )) <> 3 THEN
    RAISE EXCEPTION 'Replay duplicated activation audit events';
  END IF;
  RAISE NOTICE 'INVITATION_REPLAY_IDEMPOTENT';
END $$;

ROLLBACK;
