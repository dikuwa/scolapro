-- Issue #567: governed school-local withdrawal/left-school exits over the
-- existing enrolment identity and lifecycle. Transfers and progression completion
-- continue to use their existing canonical workflows.

create or replace function public.exit_learner_enrolment(
  p_enrolment_id uuid,
  p_status text,
  p_effective_on date,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('left','withdrawn') then raise exception 'Unsupported learner exit outcome'; end if;
  v_reason:=nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is null then raise exception 'Exit reason is required'; end if;
  if p_effective_on is null or p_effective_on>current_date then raise exception 'Exit effective date must not be in the future'; end if;

  select * into v_enrolment from public.enrolments where id=p_enrolment_id for update;
  if not found then raise exception 'Enrolment not found'; end if;
  if not app_private.can_manage_enrolment_workflow(v_enrolment.school_id) then raise exception 'Permission denied'; end if;
  if v_enrolment.status<>'current' then raise exception 'Only a current enrolment can be exited'; end if;
  if p_effective_on<v_enrolment.enrolled_from then raise exception 'Exit date cannot precede enrolment start'; end if;

  update public.enrolments
  set status=p_status, enrolled_to=p_effective_on, updated_at=now()
  where id=v_enrolment.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_enrolment.tenant_id,v_enrolment.school_id,auth.uid(),'learner.enrolment.exited','enrolment',v_enrolment.id,
    jsonb_build_object('learner_id',v_enrolment.learner_id,'status',p_status,'effective_on',p_effective_on,'reason',v_reason));
  return true;
end;
$$;

revoke all on function public.exit_learner_enrolment(uuid,text,date,text) from public,anon;
grant execute on function public.exit_learner_enrolment(uuid,text,date,text) to authenticated;

comment on function public.exit_learner_enrolment(uuid,text,date,text) is
'Closes one current source enrolment as left or withdrawn under current-school leadership authority, preserving learner identity, dated history and audit provenance.';
