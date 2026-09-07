-- N09 audit integration: converge the examination-centre foundation on ScolaPro's
-- canonical audit_events ledger, matching the education-network governance pattern.

DROP TRIGGER IF EXISTS examination_centres_audit_trg ON public.examination_centres;
DROP TRIGGER IF EXISTS examination_centre_identifier_history_audit_trg ON public.examination_centre_identifier_history;
DROP TRIGGER IF EXISTS examination_centre_status_history_audit_trg ON public.examination_centre_status_history;
DROP TRIGGER IF EXISTS school_examination_centre_assignments_audit_trg ON public.school_examination_centre_assignments;
DROP TRIGGER IF EXISTS examination_candidate_centre_assignments_audit_trg ON public.examination_candidate_centre_assignments;
DROP TRIGGER IF EXISTS examination_centre_audit_immutable_trg ON public.examination_centre_audit_events;
DROP TABLE IF EXISTS public.examination_centre_audit_events;
DROP FUNCTION IF EXISTS app_private.enforce_examination_centre_audit_immutability();
DROP FUNCTION IF EXISTS app_private.audit_examination_centre_mutation();

CREATE OR REPLACE FUNCTION app_private.audit_examination_centre_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row_id uuid;
  v_school_id uuid;
  v_tenant_id uuid;
BEGIN
  v_old := CASE WHEN tg_op IN ('UPDATE','DELETE') THEN to_jsonb(old) ELSE NULL END;
  v_new := CASE WHEN tg_op IN ('INSERT','UPDATE') THEN to_jsonb(new) ELSE NULL END;
  v_row_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);
  v_school_id := coalesce((v_new ->> 'school_id')::uuid, (v_old ->> 'school_id')::uuid);
  v_tenant_id := coalesce((v_new ->> 'tenant_id')::uuid, (v_old ->> 'tenant_id')::uuid);

  IF v_school_id IS NOT NULL AND v_tenant_id IS NULL THEN
    SELECT s.tenant_id INTO v_tenant_id
    FROM public.schools s
    WHERE s.id = v_school_id;
  END IF;

  INSERT INTO public.audit_events(
    tenant_id,
    school_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    v_tenant_id,
    v_school_id,
    auth.uid(),
    'examination_centre.' || lower(tg_op),
    tg_table_name,
    v_row_id,
    jsonb_build_object('old', v_old, 'new', v_new)
  );

  IF tg_op = 'DELETE' THEN
    RETURN old;
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION app_private.audit_examination_centre_mutation()
  FROM public, anon, authenticated;

CREATE TRIGGER examination_centres_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.examination_centres
FOR EACH ROW EXECUTE FUNCTION app_private.audit_examination_centre_mutation();
CREATE TRIGGER examination_centre_identifier_history_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.examination_centre_identifier_history
FOR EACH ROW EXECUTE FUNCTION app_private.audit_examination_centre_mutation();
CREATE TRIGGER examination_centre_status_history_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.examination_centre_status_history
FOR EACH ROW EXECUTE FUNCTION app_private.audit_examination_centre_mutation();
CREATE TRIGGER school_examination_centre_assignments_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.school_examination_centre_assignments
FOR EACH ROW EXECUTE FUNCTION app_private.audit_examination_centre_mutation();
CREATE TRIGGER examination_candidate_centre_assignments_audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.examination_candidate_centre_assignments
FOR EACH ROW EXECUTE FUNCTION app_private.audit_examination_centre_mutation();

COMMENT ON FUNCTION app_private.audit_examination_centre_mutation() IS
'Writes N09 examination-centre reference, identifier, status, school-assignment and candidate-assignment mutations to the canonical public.audit_events ledger.';
