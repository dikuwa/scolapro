-- Learner registration may be replayed after a lost response or browser reload. Reuse the
-- existing client-operation receipt foundation so a stable client operation UUID creates
-- exactly one long-lived learner identity and annual enrolment.

create or replace function public.create_learner_enrolment_idempotent(
  p_client_operation_id uuid,
  p_school_id uuid,
  p_academic_year integer,
  p_grade_id uuid,
  p_register_class_id uuid,
  p_first_names text,
  p_surname text,
  p_preferred_name text default null,
  p_date_of_birth date default null,
  p_sex text default 'unspecified',
  p_admission_number text default null,
  p_enrolled_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_tenant_id uuid;
  v_existing public.client_operation_receipts%rowtype;
  v_payload jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_lock_key bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_client_operation_id is null then raise exception 'Client operation ID is required'; end if;

  select s.tenant_id into v_tenant_id
  from public.schools s
  where s.id=p_school_id and s.status='active';
  if v_tenant_id is null then raise exception 'School is not available.' using errcode='22023'; end if;

  v_payload:=jsonb_build_object(
    'school_id',p_school_id,
    'academic_year',p_academic_year,
    'grade_id',p_grade_id,
    'register_class_id',p_register_class_id,
    'first_names',btrim(p_first_names),
    'surname',btrim(p_surname),
    'preferred_name',nullif(btrim(coalesce(p_preferred_name,'')),''),
    'date_of_birth',p_date_of_birth,
    'sex',p_sex,
    'admission_number',nullif(upper(btrim(coalesce(p_admission_number,''))),''),
    'enrolled_from',p_enrolled_from
  );
  v_fingerprint:=md5(v_payload::text);

  -- Serialize concurrent replays before looking up/inserting the unique receipt.
  v_lock_key:=hashtextextended(auth.uid()::text||':learner.register:'||p_client_operation_id::text,0);
  perform pg_advisory_xact_lock(v_lock_key);

  select * into v_existing
  from public.client_operation_receipts
  where actor_user_id=auth.uid()
    and operation_type='learner.register'
    and client_operation_id=p_client_operation_id;

  if found then
    if v_existing.payload_fingerprint<>v_fingerprint then
      raise exception 'Client operation ID was already used with different learner registration data';
    end if;
    if v_existing.completed_at is null or v_existing.result_payload is null then
      raise exception 'Client operation is already being processed';
    end if;
    return v_existing.result_payload;
  end if;

  insert into public.client_operation_receipts(
    tenant_id,school_id,actor_user_id,operation_type,client_operation_id,payload_fingerprint
  ) values(
    v_tenant_id,p_school_id,auth.uid(),'learner.register',p_client_operation_id,v_fingerprint
  );

  v_result:=public.create_learner_enrolment(
    p_school_id,p_academic_year,p_grade_id,p_register_class_id,p_first_names,p_surname,
    p_preferred_name,p_date_of_birth,p_sex,p_admission_number,p_enrolled_from
  );

  update public.client_operation_receipts
  set result_payload=v_result,completed_at=now()
  where actor_user_id=auth.uid()
    and operation_type='learner.register'
    and client_operation_id=p_client_operation_id;

  return v_result;
end;
$$;

revoke all on function public.create_learner_enrolment_idempotent(uuid,uuid,integer,uuid,uuid,text,text,text,date,text,text,date)
from public,anon;
grant execute on function public.create_learner_enrolment_idempotent(uuid,uuid,integer,uuid,uuid,text,text,text,date,text,text,date)
to authenticated;

comment on function public.create_learner_enrolment_idempotent(uuid,uuid,integer,uuid,uuid,text,text,text,date,text,text,date) is
'Retry-safe learner registration. Replaying the same actor/client-operation/payload returns the original learner and enrolment instead of creating a duplicate learner identity.';
