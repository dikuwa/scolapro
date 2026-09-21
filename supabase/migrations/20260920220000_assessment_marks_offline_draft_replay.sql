-- Issue #606: server-authoritative replay for offline working-mark drafts.
-- This is deliberately limited to open assessment instances. Review,
-- verification, locking and publication remain online-only workflows.

create or replace function public.submit_offline_assessment_mark(
  p_assessment_instance_id uuid,
  p_enrolment_id uuid,
  p_learner_id uuid,
  p_numeric_mark numeric default null,
  p_mark_status text default null,
  p_teacher_note text default null,
  p_expected_version uuid default null,
  p_client_mutation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_current public.learner_marks%rowtype;
  v_existing public.learner_marks%rowtype;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_client_mutation_id is null then
    return jsonb_build_object('outcome','rejected','code','client_mutation_id_required');
  end if;

  select * into v_instance
  from public.assessment_instances
  where id=p_assessment_instance_id
  for update;
  if not found then
    return jsonb_build_object('outcome','rejected','code','assessment_not_found');
  end if;

  if not app_private.can_access_assessment_instance(v_instance.id) then
    raise exception 'Permission denied';
  end if;

  -- Check the idempotency key before comparing versions. A replay of a
  -- completed operation must succeed even though the current version advanced.
  select * into v_existing
  from public.learner_marks
  where school_id=v_instance.school_id
    and client_mutation_id=p_client_mutation_id
  for update;
  if found then
    if v_existing.assessment_instance_id is distinct from p_assessment_instance_id
       or v_existing.enrolment_id is distinct from p_enrolment_id
       or v_existing.learner_id is distinct from p_learner_id
       or v_existing.numeric_mark is distinct from p_numeric_mark
       or v_existing.mark_status is distinct from p_mark_status
       or v_existing.teacher_note is distinct from p_teacher_note
       or v_existing.recorded_by_user_id is distinct from auth.uid() then
      return jsonb_build_object('outcome','rejected','code','idempotency_payload_mismatch');
    end if;
    return jsonb_build_object(
      'outcome','success',
      'mark_id',v_existing.id,
      'version',v_existing.id,
      'replayed',true
    );
  end if;

  if v_instance.status <> 'open' then
    return jsonb_build_object(
      'outcome','rejected',
      'code','assessment_not_editable',
      'status',v_instance.status
    );
  end if;

  select * into v_current
  from public.learner_marks
  where assessment_instance_id=p_assessment_instance_id
    and enrolment_id=p_enrolment_id
  order by recorded_at desc, created_at desc
  limit 1
  for update;

  if v_current.id is distinct from p_expected_version then
    return jsonb_build_object(
      'outcome','conflicted',
      'code','stale_version',
      'current_version',v_current.id
    );
  end if;

  if p_numeric_mark is not null and p_mark_status is not null then
    return jsonb_build_object('outcome','rejected','code','mark_value_and_status_are_mutually_exclusive');
  end if;

  insert into public.learner_marks(
    tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,
    numeric_mark,mark_status,teacher_note,recorded_by_user_id,
    client_mutation_id,replaces_mark_id
  ) values (
    v_instance.tenant_id,v_instance.school_id,p_assessment_instance_id,
    p_enrolment_id,p_learner_id,p_numeric_mark,p_mark_status,p_teacher_note,
    auth.uid(),p_client_mutation_id,v_current.id
  )
  returning id into v_new_id;

  return jsonb_build_object(
    'outcome','success',
    'mark_id',v_new_id,
    'version',v_new_id,
    'replayed',false
  );
end;
$$;

revoke all on function public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)
from public, anon;
grant execute on function public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)
to authenticated;

comment on function public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid) is
'Offline-safe working-mark draft replay. Uses the current learner mark id as an optimistic version, is idempotent by client mutation id, rejects non-open instances, and never changes review, verification, locking or publication state.';