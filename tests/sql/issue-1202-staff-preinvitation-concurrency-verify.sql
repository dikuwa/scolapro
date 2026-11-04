\set ON_ERROR_STOP on
DO $$
BEGIN
  IF (SELECT status FROM public.school_invitations
      WHERE id='70000000-0000-4000-8000-000000005212') <> 'accepted' THEN
    RAISE EXCEPTION 'Concurrent invitation was not accepted';
  END IF;
  IF (SELECT accepted_user_id FROM public.school_invitations
      WHERE id='70000000-0000-4000-8000-000000005212')
      <> '70000000-0000-4000-8000-000000000213'::uuid THEN
    RAISE EXCEPTION 'Concurrent acceptance linked the wrong user';
  END IF;
  IF (SELECT count(*) FROM public.school_memberships
      WHERE staff_member_id='70000000-0000-4000-8000-000000001212') <> 2 THEN
    RAISE EXCEPTION 'Concurrent acceptance duplicated school memberships';
  END IF;
  IF (SELECT count(*) FROM public.audit_events
      WHERE event_type='staff.planned_role_activated'
        AND entity_id IN (
          SELECT id FROM public.school_memberships
          WHERE staff_member_id='70000000-0000-4000-8000-000000001212'
        )) <> 2 THEN
    RAISE EXCEPTION 'Concurrent acceptance duplicated activation audit';
  END IF;
  IF (SELECT count(*) FROM public.staff_planned_school_roles
      WHERE staff_member_id='70000000-0000-4000-8000-000000001212'
        AND linked_user_id='70000000-0000-4000-8000-000000000213'
        AND linked_at IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'Concurrent acceptance did not link the complete plan set';
  END IF;
  RAISE NOTICE 'CONCURRENT_ACCEPTANCE_SERIALIZED_AND_IDEMPOTENT';
END $$;
