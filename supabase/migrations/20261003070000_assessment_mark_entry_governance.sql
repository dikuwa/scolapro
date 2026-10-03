-- Issue #993: governed mark-entry windows, bounded correction authority, and immutable result supersession.
-- Mark-entry timing is deliberately separate from moderation state, official-result finality,
-- and report-card publication. Effective locks are resolved server-side at mutation time.

alter table public.assessment_instances
  add column if not exists correction_pending boolean not null default false,
  add column if not exists correction_started_at timestamptz,
  add column if not exists correction_completed_at timestamptz;

create table if not exists public.assessment_mark_entry_windows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  assessment_instance_id uuid not null unique references public.assessment_instances(id) on delete cascade,
  opens_at timestamptz,
  closes_at timestamptz,
  warning_minutes integer not null default 0 check (warning_minutes between 0 and 10080),
  policy_mode text not null default 'manual'
    check (policy_mode in ('manual','deadline','verification','deadline_and_verification')),
  manual_locked_at timestamptz,
  manual_locked_by_user_id uuid references auth.users(id) on delete restrict,
  manual_lock_reason text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at),
  check (
    policy_mode not in ('deadline','deadline_and_verification')
    or closes_at is not null
  ),
  check (
    (manual_locked_at is null and manual_locked_by_user_id is null and manual_lock_reason is null)
    or
    (
      manual_locked_at is not null
      and manual_locked_by_user_id is not null
      and nullif(btrim(coalesce(manual_lock_reason,'')),'') is not null
    )
  )
);

create index if not exists assessment_mark_entry_windows_school_idx
  on public.assessment_mark_entry_windows(school_id,assessment_instance_id);

alter table public.assessment_mark_entry_windows enable row level security;

create table if not exists public.assessment_mark_reopen_authorizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  scope_kind text not null check (scope_kind in ('learner','component','subject_class')),
  assessment_instance_id uuid references public.assessment_instances(id) on delete restrict,
  enrolment_id uuid references public.enrolments(id) on delete restrict,
  subject_offering_id uuid not null references public.subject_offerings(id) on delete restrict,
  register_class_id uuid not null references public.register_classes(id) on delete restrict,
  term_number smallint check (term_number between 1 and 6),
  reason text not null check (nullif(btrim(reason),'') is not null),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  requires_reverification boolean not null default true check (requires_reverification=true),
  status text not null default 'active' check (status in ('active','closed','revoked')),
  authorized_by_user_id uuid not null references auth.users(id) on delete restrict,
  used_at timestamptz,
  closed_at timestamptz,
  closed_by_user_id uuid references auth.users(id) on delete restrict,
  close_reason text,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at),
  check (
    (scope_kind='learner' and assessment_instance_id is not null and enrolment_id is not null)
    or
    (scope_kind='component' and assessment_instance_id is not null and enrolment_id is null)
    or
    (scope_kind='subject_class' and assessment_instance_id is null and enrolment_id is null)
  ),
  check (
    (status='active' and closed_at is null and closed_by_user_id is null)
    or
    (status in ('closed','revoked') and closed_at is not null and closed_by_user_id is not null)
  )
);

create index if not exists assessment_mark_reopen_instance_idx
  on public.assessment_mark_reopen_authorizations(assessment_instance_id,status,starts_at,expires_at);
create index if not exists assessment_mark_reopen_subject_class_idx
  on public.assessment_mark_reopen_authorizations(
    subject_offering_id,register_class_id,term_number,status,starts_at,expires_at
  );
create index if not exists assessment_mark_reopen_enrolment_idx
  on public.assessment_mark_reopen_authorizations(enrolment_id,status,starts_at,expires_at);

alter table public.assessment_mark_reopen_authorizations enable row level security;

alter table public.learner_marks
  add column if not exists correction_authorization_id uuid
    references public.assessment_mark_reopen_authorizations(id) on delete restrict;

create index if not exists learner_marks_correction_authorization_idx
  on public.learner_marks(correction_authorization_id)
  where correction_authorization_id is not null;

alter table public.official_results
  add column if not exists supersedes_result_id uuid
    references public.official_results(id) on delete restrict,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_result_id uuid
    references public.official_results(id) on delete restrict,
  add column if not exists correction_authorization_id uuid
    references public.assessment_mark_reopen_authorizations(id) on delete restrict;

alter table public.official_results
  drop constraint if exists official_results_enrolment_id_subject_offering_id_term_numb_key;

create unique index if not exists official_results_current_subject_term_uidx
  on public.official_results(enrolment_id,subject_offering_id,term_number)
  where superseded_at is null;

create index if not exists official_results_supersession_idx
  on public.official_results(supersedes_result_id,superseded_by_result_id);

create or replace view public.official_results_current
with (security_invoker=true)
as
select *
from public.official_results
where superseded_at is null;

revoke all on public.official_results_current from public,anon;
grant select on public.official_results_current to authenticated;

create or replace function app_private.user_can_manage_mark_entry_window(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select (select auth.uid()) is not null
    and (
      app_private.has_platform_role(array['platform_admin'])
      or (
        app_private.user_current_school_matches((select auth.uid()),p_school_id)
        and not app_private.has_platform_role(array['platform_support'])
        and app_private.has_school_role(
          p_school_id,
          array['school_admin','principal','deputy_principal']
        )
      )
    );
$$;

revoke all on function app_private.user_can_manage_mark_entry_window(uuid)
  from public,anon,authenticated;

create or replace function app_private.active_assessment_mark_reopen_authorization(
  p_assessment_instance_id uuid,
  p_enrolment_id uuid default null,
  p_at timestamptz default now()
)
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select reopen.id
  from public.assessment_instances instance
  join public.assessment_mark_reopen_authorizations reopen
    on reopen.tenant_id=instance.tenant_id
   and reopen.school_id=instance.school_id
   and reopen.subject_offering_id=instance.subject_offering_id
   and reopen.register_class_id=instance.register_class_id
   and reopen.term_number is not distinct from instance.term_number
  where instance.id=p_assessment_instance_id
    and reopen.status='active'
    and reopen.starts_at<=p_at
    and reopen.expires_at>p_at
    and (
      (
        reopen.scope_kind='learner'
        and reopen.assessment_instance_id=instance.id
        and p_enrolment_id is not null
        and reopen.enrolment_id=p_enrolment_id
      )
      or
      (
        reopen.scope_kind='component'
        and reopen.assessment_instance_id=instance.id
      )
      or reopen.scope_kind='subject_class'
    )
  order by
    case reopen.scope_kind
      when 'learner' then 1
      when 'component' then 2
      else 3
    end,
    reopen.created_at desc,
    reopen.id
  limit 1;
$$;

revoke all on function app_private.active_assessment_mark_reopen_authorization(uuid,uuid,timestamptz)
  from public,anon,authenticated;

create or replace function app_private.resolve_assessment_mark_entry_window(
  p_assessment_instance_id uuid,
  p_enrolment_id uuid default null,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_window public.assessment_mark_entry_windows%rowtype;
  v_has_window boolean:=false;
  v_active_id uuid;
  v_active_scope text;
  v_active_expires timestamptz;
  v_active_requires_reverification boolean:=false;
  v_reopened_enrolments jsonb:='[]'::jsonb;
  v_has_reopen_history boolean:=false;
  v_opened boolean:=false;
  v_manual_lock boolean:=false;
  v_deadline_lock boolean:=false;
  v_verification_lock boolean:=false;
  v_workflow_lock boolean:=false;
  v_effective_lock boolean:=false;
  v_closing boolean:=false;
  v_state text;
  v_editable boolean:=false;
begin
  select * into v_instance
  from public.assessment_instances
  where id=p_assessment_instance_id;
  if not found then
    return jsonb_build_object('state','missing','editable',false);
  end if;

  select * into v_window
  from public.assessment_mark_entry_windows
  where assessment_instance_id=v_instance.id;
  v_has_window:=found;

  if v_has_window then
    v_opened:=v_window.opens_at is null or v_window.opens_at<=p_at;
    v_manual_lock:=v_window.manual_locked_at is not null;

    if v_window.policy_mode='deadline' then
      v_deadline_lock:=v_window.closes_at is not null and v_window.closes_at<=p_at;
    elsif v_window.policy_mode='verification' then
      v_verification_lock:=v_instance.status in ('verified','locked');
    elsif v_window.policy_mode='deadline_and_verification' then
      v_deadline_lock:=v_window.closes_at is not null and v_window.closes_at<=p_at;
      v_verification_lock:=v_instance.status in ('verified','locked');
      v_deadline_lock:=v_deadline_lock and v_verification_lock;
      v_verification_lock:=false;
    end if;

    v_closing:=v_opened
      and not v_manual_lock
      and not v_deadline_lock
      and not v_verification_lock
      and v_window.closes_at is not null
      and v_window.closes_at>p_at
      and v_window.warning_minutes>0
      and v_window.closes_at<=p_at+make_interval(mins=>v_window.warning_minutes);
  else
    -- No explicit window means legacy pre-finality editing remains available.
    -- Once configured, opens_at/closes_at become the authoritative timing gate.
    v_opened:=v_instance.status in ('not_open','open','returned');
  end if;

  v_workflow_lock:=v_instance.status in ('review','verified','locked','cancelled');
  v_effective_lock:=v_manual_lock or v_deadline_lock or v_verification_lock or v_workflow_lock;

  v_active_id:=app_private.active_assessment_mark_reopen_authorization(
    v_instance.id,p_enrolment_id,p_at
  );

  if v_active_id is not null then
    select scope_kind,expires_at,requires_reverification
      into v_active_scope,v_active_expires,v_active_requires_reverification
    from public.assessment_mark_reopen_authorizations
    where id=v_active_id;
  end if;

  if p_enrolment_id is null then
    select coalesce(jsonb_agg(reopen.enrolment_id order by reopen.created_at),'[]'::jsonb)
      into v_reopened_enrolments
    from public.assessment_mark_reopen_authorizations reopen
    where reopen.status='active'
      and reopen.scope_kind='learner'
      and reopen.assessment_instance_id=v_instance.id
      and reopen.starts_at<=p_at
      and reopen.expires_at>p_at;
  end if;

  select exists(
    select 1
    from public.assessment_mark_reopen_authorizations reopen
    where reopen.tenant_id=v_instance.tenant_id
      and reopen.school_id=v_instance.school_id
      and reopen.subject_offering_id=v_instance.subject_offering_id
      and reopen.register_class_id=v_instance.register_class_id
      and reopen.term_number is not distinct from v_instance.term_number
      and reopen.used_at is not null
      and (
        reopen.assessment_instance_id=v_instance.id
        or reopen.scope_kind='subject_class'
      )
  ) into v_has_reopen_history;

  if v_instance.correction_pending and (
    v_active_id is not null
    or (p_enrolment_id is null and jsonb_array_length(v_reopened_enrolments)>0)
  ) then
    v_state:='reopened';
  elsif v_effective_lock then
    v_state:=case when v_has_reopen_history then 'locked_again' else 'locked' end;
  elsif not v_opened then
    v_state:='not_open';
  elsif v_closing then
    v_state:='closing_soon';
  else
    v_state:='open';
  end if;

  if p_enrolment_id is not null then
    if v_instance.correction_pending then
      v_editable:=v_active_id is not null;
    else
      v_editable:=v_state in ('open','closing_soon')
        and v_instance.status in ('not_open','open','returned');
    end if;
  else
    if v_instance.correction_pending then
      v_editable:=v_active_id is not null and v_active_scope<>'learner';
    else
      v_editable:=v_state in ('open','closing_soon')
        and v_instance.status in ('not_open','open','returned');
    end if;
  end if;

  return jsonb_build_object(
    'state',v_state,
    'editable',v_editable,
    'policyMode',case when v_has_window then v_window.policy_mode else 'legacy' end,
    'opensAt',case when v_has_window then v_window.opens_at else null end,
    'closesAt',case when v_has_window then v_window.closes_at else null end,
    'warningMinutes',case when v_has_window then v_window.warning_minutes else 0 end,
    'manualLockedAt',case when v_has_window then v_window.manual_locked_at else null end,
    'workflowStatus',v_instance.status,
    'correctionPending',v_instance.correction_pending,
    'activeReopenId',v_active_id,
    'activeReopenScope',v_active_scope,
    'activeReopenExpiresAt',v_active_expires,
    'requiresReverification',v_active_requires_reverification,
    'reopenedEnrolmentIds',v_reopened_enrolments,
    'lockReasons',jsonb_build_object(
      'manual',v_manual_lock,
      'deadline',v_deadline_lock,
      'verification',v_verification_lock,
      'workflow',v_workflow_lock
    ),
    'serverNow',p_at
  );
end;
$$;

revoke all on function app_private.resolve_assessment_mark_entry_window(uuid,uuid,timestamptz)
  from public,anon,authenticated;

create or replace function app_private.can_edit_assessment_mark(
  p_assessment_instance_id uuid,
  p_enrolment_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select coalesce(
    (app_private.resolve_assessment_mark_entry_window(
      p_assessment_instance_id,p_enrolment_id,p_at
    )->>'editable')::boolean,
    false
  );
$$;

revoke all on function app_private.can_edit_assessment_mark(uuid,uuid,timestamptz)
  from public,anon,authenticated;

create or replace function public.resolve_assessment_mark_entry_window(
  p_assessment_instance_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_access_assessment_instance(p_assessment_instance_id) then
    raise exception 'Permission denied';
  end if;
  return app_private.resolve_assessment_mark_entry_window(
    p_assessment_instance_id,null,now()
  );
end;
$$;

revoke all on function public.resolve_assessment_mark_entry_window(uuid)
  from public,anon;
grant execute on function public.resolve_assessment_mark_entry_window(uuid)
  to authenticated;

create or replace function public.configure_assessment_mark_entry_window(
  p_assessment_instance_id uuid,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_warning_minutes integer,
  p_policy_mode text
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_policy_mode not in ('manual','deadline','verification','deadline_and_verification') then
    raise exception 'Unsupported mark-entry lock policy';
  end if;
  if coalesce(p_warning_minutes,0)<0 or coalesce(p_warning_minutes,0)>10080 then
    raise exception 'Warning period must be between 0 and 10080 minutes';
  end if;
  if p_closes_at is not null and p_opens_at is not null and p_closes_at<=p_opens_at then
    raise exception 'Mark-entry close time must be after open time';
  end if;
  if p_policy_mode in ('deadline','deadline_and_verification') and p_closes_at is null then
    raise exception 'Deadline-based policy requires a close time';
  end if;

  select * into v_instance
  from public.assessment_instances
  where id=p_assessment_instance_id
  for update;
  if not found then raise exception 'Assessment instance not found'; end if;
  if not app_private.user_can_manage_mark_entry_window(v_instance.school_id) then
    raise exception 'Permission denied';
  end if;

  insert into public.assessment_mark_entry_windows(
    tenant_id,school_id,assessment_instance_id,opens_at,closes_at,
    warning_minutes,policy_mode,created_by_user_id
  ) values(
    v_instance.tenant_id,v_instance.school_id,v_instance.id,p_opens_at,p_closes_at,
    coalesce(p_warning_minutes,0),p_policy_mode,auth.uid()
  )
  on conflict (assessment_instance_id) do update
    set opens_at=excluded.opens_at,
        closes_at=excluded.closes_at,
        warning_minutes=excluded.warning_minutes,
        policy_mode=excluded.policy_mode,
        updated_at=now()
  returning id into v_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),
    'assessment.mark_entry_window.configured','assessment_instance',v_instance.id,
    jsonb_build_object(
      'opens_at',p_opens_at,
      'closes_at',p_closes_at,
      'warning_minutes',coalesce(p_warning_minutes,0),
      'policy_mode',p_policy_mode
    )
  );

  return v_id;
end;
$$;

revoke all on function public.configure_assessment_mark_entry_window(uuid,timestamptz,timestamptz,integer,text)
  from public,anon;
grant execute on function public.configure_assessment_mark_entry_window(uuid,timestamptz,timestamptz,integer,text)
  to authenticated;

create or replace function public.lock_assessment_mark_entry(
  p_assessment_instance_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_reason is null then raise exception 'A manual lock reason is required'; end if;

  select * into v_instance
  from public.assessment_instances
  where id=p_assessment_instance_id
  for update;
  if not found then raise exception 'Assessment instance not found'; end if;
  if not app_private.user_can_manage_mark_entry_window(v_instance.school_id) then
    raise exception 'Permission denied';
  end if;

  insert into public.assessment_mark_entry_windows(
    tenant_id,school_id,assessment_instance_id,warning_minutes,policy_mode,
    manual_locked_at,manual_locked_by_user_id,manual_lock_reason,created_by_user_id
  ) values(
    v_instance.tenant_id,v_instance.school_id,v_instance.id,0,'manual',
    now(),auth.uid(),v_reason,auth.uid()
  )
  on conflict (assessment_instance_id) do update
    set manual_locked_at=now(),
        manual_locked_by_user_id=auth.uid(),
        manual_lock_reason=v_reason,
        updated_at=now();

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),
    'assessment.mark_entry_window.locked','assessment_instance',v_instance.id,
    jsonb_build_object('reason',v_reason)
  );
  return true;
end;
$$;

revoke all on function public.lock_assessment_mark_entry(uuid,text)
  from public,anon;
grant execute on function public.lock_assessment_mark_entry(uuid,text)
  to authenticated;

create or replace function public.authorize_assessment_mark_correction(
  p_assessment_instance_id uuid,
  p_scope_kind text,
  p_enrolment_id uuid,
  p_reason text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_requires_reverification boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_subject_id uuid;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_id uuid;
  v_is_school_leader boolean:=false;
  v_is_hod boolean:=false;
  v_effective_window jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_scope_kind not in ('learner','component','subject_class') then
    raise exception 'Correction scope must be learner, component, or subject_class';
  end if;
  if v_reason is null then raise exception 'A correction reason is required'; end if;
  if p_starts_at is null or p_expires_at is null or p_expires_at<=p_starts_at then
    raise exception 'Correction authorization requires a valid start and expiry';
  end if;
  if coalesce(p_requires_reverification,false)<>true then
    raise exception 'Correction authorization requires re-verification';
  end if;

  select * into v_instance
  from public.assessment_instances
  where id=p_assessment_instance_id
  for update;
  if not found then raise exception 'Assessment instance not found'; end if;

  select subject_id into v_subject_id
  from public.subject_offerings
  where id=v_instance.subject_offering_id;

  v_is_school_leader:=
    app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()),v_instance.school_id)
      and not app_private.has_platform_role(array['platform_support'])
      and app_private.has_school_role(
        v_instance.school_id,
        array['school_admin','principal','deputy_principal']
      )
    );

  v_is_hod:=
    app_private.user_current_school_matches((select auth.uid()),v_instance.school_id)
    and not app_private.has_platform_role(array['platform_support'])
    and app_private.hod_responsible_for_subject(v_instance.school_id,v_subject_id);

  if p_scope_kind='subject_class' then
    if not v_is_school_leader then
      raise exception 'Subject-class correction requires school leadership authority';
    end if;
  elsif not (v_is_school_leader or v_is_hod) then
    raise exception 'Permission denied';
  end if;

  v_effective_window:=app_private.resolve_assessment_mark_entry_window(
    v_instance.id,
    case when p_scope_kind='learner' then p_enrolment_id else null end,
    now()
  );

  if not (
    v_instance.status in ('verified','locked')
    or (v_instance.status='returned' and v_instance.correction_pending)
    or (
      v_instance.status in ('not_open','open','returned')
      and coalesce(v_effective_window->>'state','') in ('locked','locked_again')
    )
  ) then
    raise exception 'Only an effectively locked assessment or already-open correction work can be authorized';
  end if;

  if p_scope_kind='learner' then
    if p_enrolment_id is null or not exists(
      select 1
      from public.enrolments enrolment
      where enrolment.id=p_enrolment_id
        and enrolment.tenant_id=v_instance.tenant_id
        and enrolment.school_id=v_instance.school_id
        and enrolment.academic_year=v_instance.academic_year
        and enrolment.register_class_id=v_instance.register_class_id
    ) then
      raise exception 'Learner correction scope is outside this assessment';
    end if;
  elsif p_enrolment_id is not null then
    raise exception 'Only learner correction scope accepts an enrolment';
  end if;

  insert into public.assessment_mark_reopen_authorizations(
    tenant_id,school_id,scope_kind,assessment_instance_id,enrolment_id,
    subject_offering_id,register_class_id,term_number,reason,starts_at,expires_at,
    requires_reverification,authorized_by_user_id
  ) values(
    v_instance.tenant_id,v_instance.school_id,p_scope_kind,
    case when p_scope_kind='subject_class' then null else v_instance.id end,
    case when p_scope_kind='learner' then p_enrolment_id else null end,
    v_instance.subject_offering_id,v_instance.register_class_id,v_instance.term_number,
    v_reason,p_starts_at,p_expires_at,true,auth.uid()
  )
  returning id into v_id;

  if p_scope_kind='subject_class' then
    update public.assessment_instances target
       set correction_pending=true,
           correction_started_at=coalesce(target.correction_started_at,p_starts_at),
           correction_completed_at=null,
           updated_at=now()
     where target.tenant_id=v_instance.tenant_id
       and target.school_id=v_instance.school_id
       and target.subject_offering_id=v_instance.subject_offering_id
       and target.register_class_id=v_instance.register_class_id
       and target.term_number is not distinct from v_instance.term_number
       and (
         target.status in ('verified','locked')
         or target.correction_pending
         or (
           target.status in ('not_open','open','returned')
           and coalesce(
             app_private.resolve_assessment_mark_entry_window(target.id,null,now())->>'state',
             ''
           ) in ('locked','locked_again')
         )
       );
  else
    update public.assessment_instances
       set correction_pending=true,
           correction_started_at=coalesce(correction_started_at,p_starts_at),
           correction_completed_at=null,
           updated_at=now()
     where id=v_instance.id;
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),
    'assessment.mark_correction.authorized','assessment_mark_reopen_authorization',v_id,
    jsonb_build_object(
      'assessment_instance_id',v_instance.id,
      'scope_kind',p_scope_kind,
      'enrolment_id',p_enrolment_id,
      'subject_offering_id',v_instance.subject_offering_id,
      'register_class_id',v_instance.register_class_id,
      'term_number',v_instance.term_number,
      'reason',v_reason,
      'starts_at',p_starts_at,
      'expires_at',p_expires_at,
      'requires_reverification',coalesce(p_requires_reverification,true)
    )
  );

  return v_id;
end;
$$;

revoke all on function public.authorize_assessment_mark_correction(uuid,text,uuid,text,timestamptz,timestamptz,boolean)
  from public,anon;
grant execute on function public.authorize_assessment_mark_correction(uuid,text,uuid,text,timestamptz,timestamptz,boolean)
  to authenticated;

create or replace function public.revoke_assessment_mark_correction(
  p_authorization_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_authorization public.assessment_mark_reopen_authorizations%rowtype;
  v_instance_id uuid;
  v_subject_id uuid;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_is_school_leader boolean:=false;
  v_is_hod boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_reason is null then raise exception 'A revocation reason is required'; end if;

  select * into v_authorization
  from public.assessment_mark_reopen_authorizations
  where id=p_authorization_id
  for update;
  if not found then raise exception 'Correction authorization not found'; end if;
  if v_authorization.status<>'active' then raise exception 'Correction authorization is not active'; end if;

  select subject_id into v_subject_id
  from public.subject_offerings
  where id=v_authorization.subject_offering_id;

  v_is_school_leader:=
    app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()),v_authorization.school_id)
      and not app_private.has_platform_role(array['platform_support'])
      and app_private.has_school_role(
        v_authorization.school_id,
        array['school_admin','principal','deputy_principal']
      )
    );
  v_is_hod:=
    app_private.user_current_school_matches((select auth.uid()),v_authorization.school_id)
    and not app_private.has_platform_role(array['platform_support'])
    and app_private.hod_responsible_for_subject(v_authorization.school_id,v_subject_id);

  if v_authorization.scope_kind='subject_class' then
    if not v_is_school_leader then raise exception 'Permission denied'; end if;
  elsif not (v_is_school_leader or v_is_hod) then
    raise exception 'Permission denied';
  end if;

  update public.assessment_mark_reopen_authorizations
     set status='revoked',
         closed_at=now(),
         closed_by_user_id=auth.uid(),
         close_reason=v_reason
   where id=v_authorization.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_authorization.tenant_id,v_authorization.school_id,auth.uid(),
    'assessment.mark_correction.revoked','assessment_mark_reopen_authorization',v_authorization.id,
    jsonb_build_object('reason',v_reason)
  );

  return true;
end;
$$;

revoke all on function public.revoke_assessment_mark_correction(uuid,text)
  from public,anon;
grant execute on function public.revoke_assessment_mark_correction(uuid,text)
  to authenticated;

drop policy if exists "assessment staff read mark entry windows"
  on public.assessment_mark_entry_windows;
create policy "assessment staff read mark entry windows"
on public.assessment_mark_entry_windows for select to authenticated
using (app_private.can_access_assessment_instance(assessment_instance_id));

drop policy if exists "assessment staff read mark correction authorizations"
  on public.assessment_mark_reopen_authorizations;
create policy "assessment staff read mark correction authorizations"
on public.assessment_mark_reopen_authorizations for select to authenticated
using (
  app_private.has_platform_role(array['platform_admin'])
  or (
    app_private.user_current_school_matches((select auth.uid()),school_id)
    and not app_private.has_platform_role(array['platform_support'])
    and (
      (
        assessment_instance_id is not null
        and app_private.can_access_assessment_instance(assessment_instance_id)
      )
      or app_private.has_school_role(
        school_id,
        array['school_admin','principal','deputy_principal']
      )
      or (
        app_private.has_school_role(school_id,array['hod'])
        and app_private.hod_responsible_for_subject(
          school_id,
          (
            select offering.subject_id
            from public.subject_offerings offering
            where offering.id=assessment_mark_reopen_authorizations.subject_offering_id
          )
        )
      )
    )
  )
);

revoke insert,update,delete on public.assessment_mark_entry_windows from authenticated;
revoke insert,update,delete on public.assessment_mark_reopen_authorizations from authenticated;
grant select on public.assessment_mark_entry_windows to authenticated;
grant select on public.assessment_mark_reopen_authorizations to authenticated;

create or replace function app_private.enforce_learner_mark_recorder_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_active_authorization_id uuid;
  v_correction_pending boolean:=false;
  v_instance_status text;
begin
  if auth.uid() is not null
     and new.recorded_by_user_id is distinct from auth.uid() then
    raise exception 'Learner mark recorder must match authenticated actor';
  end if;

  if not app_private.user_can_access_assessment_instance(
    new.recorded_by_user_id,
    new.assessment_instance_id
  ) then
    raise exception 'Learner mark recorder is not authorized for assessment instance';
  end if;

  if auth.uid() is not null then
    select status,correction_pending
      into v_instance_status,v_correction_pending
    from public.assessment_instances
    where id=new.assessment_instance_id;

    if not app_private.can_edit_assessment_mark(
      new.assessment_instance_id,new.enrolment_id,now()
    ) then
      if v_instance_status in ('review','verified','locked','cancelled')
         and not v_correction_pending then
        raise exception 'Assessment is not open for mark editing';
      end if;
      raise exception 'Assessment mark-entry window is not editable for this learner';
    end if;

    if v_correction_pending then
      v_active_authorization_id:=app_private.active_assessment_mark_reopen_authorization(
        new.assessment_instance_id,new.enrolment_id,now()
      );
      if v_active_authorization_id is null then
        raise exception 'No active correction authorization covers this learner';
      end if;

      new.correction_authorization_id:=v_active_authorization_id;

      update public.assessment_mark_reopen_authorizations
         set used_at=coalesce(used_at,now())
       where id=v_active_authorization_id;

      update public.assessment_instances
         set status=case when status in ('verified','locked') then 'returned' else status end,
             locked_at=case when status in ('verified','locked') then null else locked_at end,
             updated_at=now()
       where id=new.assessment_instance_id;
    else
      new.correction_authorization_id:=null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_learner_mark_recorder_integrity()
  from public,anon,authenticated;

create or replace function app_private.audit_corrected_learner_mark()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_previous public.learner_marks%rowtype;
  v_authorization public.assessment_mark_reopen_authorizations%rowtype;
begin
  if new.correction_authorization_id is null then return new; end if;

  if new.replaces_mark_id is not null then
    select * into v_previous
    from public.learner_marks
    where id=new.replaces_mark_id;
  end if;
  select * into v_authorization
  from public.assessment_mark_reopen_authorizations
  where id=new.correction_authorization_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    new.tenant_id,new.school_id,new.recorded_by_user_id,
    'assessment.mark_corrected','learner_mark',new.id,
    jsonb_build_object(
      'assessment_instance_id',new.assessment_instance_id,
      'enrolment_id',new.enrolment_id,
      'authorization_id',new.correction_authorization_id,
      'scope_kind',v_authorization.scope_kind,
      'reason',v_authorization.reason,
      'old_mark_id',v_previous.id,
      'old_numeric_mark',v_previous.numeric_mark,
      'old_mark_status',v_previous.mark_status,
      'new_numeric_mark',new.numeric_mark,
      'new_mark_status',new.mark_status,
      'changed_at',new.recorded_at,
      'requires_reverification',v_authorization.requires_reverification
    )
  );

  return new;
end;
$$;

revoke all on function app_private.audit_corrected_learner_mark()
  from public,anon,authenticated;

drop trigger if exists learner_mark_correction_audit_trg on public.learner_marks;
create trigger learner_mark_correction_audit_trg
after insert on public.learner_marks
for each row execute function app_private.audit_corrected_learner_mark();

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
set search_path=public,app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_current public.learner_marks%rowtype;
  v_existing public.learner_marks%rowtype;
  v_new_id uuid;
  v_max numeric;
  v_reference_date date;
  v_window jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
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
      'outcome','success','mark_id',v_existing.id,
      'version',v_existing.id,'replayed',true
    );
  end if;

  v_window:=app_private.resolve_assessment_mark_entry_window(
    v_instance.id,p_enrolment_id,now()
  );
  if coalesce((v_window->>'editable')::boolean,false)=false then
    return jsonb_build_object(
      'outcome','rejected',
      'code','assessment_not_editable',
      'status',v_instance.status,
      'window_state',v_window->>'state'
    );
  end if;

  v_reference_date:=coalesce(
    v_instance.assessment_date,
    (now() at time zone 'Africa/Windhoek')::date
  );

  select * into v_enrolment
    from public.enrolments
   where id=p_enrolment_id;
  if not found
     or v_enrolment.school_id is distinct from v_instance.school_id
     or v_enrolment.academic_year is distinct from v_instance.academic_year
     or v_enrolment.register_class_id is distinct from v_instance.register_class_id
     or v_enrolment.learner_id is distinct from p_learner_id
     or v_enrolment.enrolled_from>v_reference_date
     or (v_enrolment.enrolled_to is not null and v_enrolment.enrolled_to<v_reference_date)
     or (v_instance.assessment_date is null and v_enrolment.status<>'current') then
    return jsonb_build_object('outcome','rejected','code','learner_not_eligible');
  end if;

  if not app_private.learner_subject_registered_on(
    v_enrolment.id,v_instance.subject_offering_id,v_reference_date
  ) then
    return jsonb_build_object(
      'outcome','rejected','code','learner_not_registered_for_subject'
    );
  end if;

  if p_numeric_mark is not null and p_mark_status is not null then
    return jsonb_build_object(
      'outcome','rejected','code','mark_value_and_status_are_mutually_exclusive'
    );
  end if;
  if p_numeric_mark is not null and p_numeric_mark<0 then
    return jsonb_build_object('outcome','rejected','code','negative_mark');
  end if;

  v_max:=v_instance.raw_max;
  if v_max is null and v_instance.assessment_component_id is not null then
    select ac.raw_max into v_max
      from public.assessment_components ac
     where ac.id=v_instance.assessment_component_id;
  end if;
  if p_numeric_mark is not null and v_max is not null and p_numeric_mark>v_max then
    return jsonb_build_object(
      'outcome','rejected','code','mark_exceeds_maximum','raw_max',v_max
    );
  end if;

  select * into v_current
    from public.learner_marks
   where assessment_instance_id=p_assessment_instance_id
     and enrolment_id=p_enrolment_id
   order by recorded_at desc,created_at desc
   limit 1
   for update;

  if v_current.id is distinct from p_expected_version then
    return jsonb_build_object(
      'outcome','conflicted','code','stale_version','current_version',v_current.id
    );
  end if;

  insert into public.learner_marks(
    tenant_id,school_id,assessment_instance_id,enrolment_id,learner_id,
    numeric_mark,mark_status,teacher_note,recorded_by_user_id,
    client_mutation_id,replaces_mark_id
  ) values(
    v_instance.tenant_id,v_instance.school_id,p_assessment_instance_id,
    p_enrolment_id,p_learner_id,p_numeric_mark,p_mark_status,p_teacher_note,
    auth.uid(),p_client_mutation_id,v_current.id
  ) returning id into v_new_id;

  return jsonb_build_object(
    'outcome','success','mark_id',v_new_id,'version',v_new_id,'replayed',false,
    'window_state',v_window->>'state'
  );
end;
$$;

revoke all on function public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)
  from public,anon;
grant execute on function public.submit_offline_assessment_mark(uuid,uuid,uuid,numeric,text,text,uuid,uuid)
  to authenticated;

create or replace function public.submit_assessment_for_review(
  p_assessment_instance_id uuid,
  p_calculation_version text default 'weighted-v1'
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_instance public.assessment_instances%rowtype;
  v_expected integer;
  v_captured integer;
  v_submission_id uuid;
  v_reference_date date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_instance
    from public.assessment_instances
   where id=p_assessment_instance_id
   for update;
  if not found then raise exception 'Assessment instance not found'; end if;
  if not app_private.can_access_assessment_instance(v_instance.id) then
    raise exception 'Permission denied';
  end if;
  if v_instance.status not in ('not_open','open','returned') then
    raise exception 'Assessment is not open for submission';
  end if;

  if v_instance.status='not_open'
     and not exists(
       select 1 from public.assessment_mark_entry_windows
       where assessment_instance_id=v_instance.id
     ) then
    raise exception 'Assessment mark-entry window has not opened';
  end if;

  if v_instance.correction_pending and not exists(
    select 1
    from public.learner_marks mark
    join public.assessment_mark_reopen_authorizations reopen
      on reopen.id=mark.correction_authorization_id
    where mark.assessment_instance_id=v_instance.id
      and reopen.requires_reverification=true
  ) then
    raise exception 'Correction requires at least one governed mark revision before re-verification';
  end if;

  v_reference_date:=coalesce(
    v_instance.assessment_date,
    (now() at time zone 'Africa/Windhoek')::date
  );

  select count(*) into v_expected
  from public.enrolments e
  where e.school_id=v_instance.school_id
    and e.register_class_id=v_instance.register_class_id
    and e.academic_year=v_instance.academic_year
    and e.enrolled_from<=v_reference_date
    and (e.enrolled_to is null or e.enrolled_to>=v_reference_date)
    and (v_instance.assessment_date is not null or e.status='current')
    and app_private.learner_subject_registered_on(
      e.id,v_instance.subject_offering_id,v_reference_date
    );

  select count(*) into v_captured
  from public.learner_marks_current lm
  join public.enrolments e on e.id=lm.enrolment_id
  where lm.assessment_instance_id=v_instance.id
    and (lm.numeric_mark is not null or lm.mark_status is not null)
    and e.enrolled_from<=v_reference_date
    and (e.enrolled_to is null or e.enrolled_to>=v_reference_date)
    and (v_instance.assessment_date is not null or e.status='current')
    and app_private.learner_subject_registered_on(
      e.id,v_instance.subject_offering_id,v_reference_date
    );

  if v_expected=0 then raise exception 'Assessment class has no eligible learners'; end if;
  if v_captured<v_expected then
    raise exception 'Marks are incomplete: % of % eligible learners captured',v_captured,v_expected;
  end if;

  insert into public.mark_submissions(
    tenant_id,school_id,assessment_instance_id,submitted_by_user_id,
    completeness,calculation_version
  ) values(
    v_instance.tenant_id,v_instance.school_id,v_instance.id,auth.uid(),
    jsonb_build_object(
      'expected',v_expected,
      'captured',v_captured,
      'eligibility_reference_date',v_reference_date,
      'eligibility','dated-enrolment-and-subject-registration',
      'correction_reverification',v_instance.correction_pending
    ),
    p_calculation_version
  ) returning id into v_submission_id;

  update public.assessment_instances
     set status='review',updated_at=now()
   where id=v_instance.id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),
    'assessment.submitted','assessment_instance',v_instance.id,
    jsonb_build_object(
      'submission_id',v_submission_id,
      'expected',v_expected,
      'captured',v_captured,
      'eligibility_reference_date',v_reference_date,
      'eligibility','dated-enrolment-and-subject-registration',
      'correction_reverification',v_instance.correction_pending
    )
  );

  return v_submission_id;
end;
$$;

revoke all on function public.submit_assessment_for_review(uuid,text)
  from public,anon;
grant execute on function public.submit_assessment_for_review(uuid,text)
  to authenticated;

create or replace function public.review_mark_submission(
  p_submission_id uuid,
  p_decision text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_submission public.mark_submissions%rowtype;
  v_instance public.assessment_instances%rowtype;
  v_subject_id uuid;
  v_authorized boolean:=false;
  v_new_status text;
  v_was_correction boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('return','verify') then raise exception 'Decision must be return or verify'; end if;

  select * into v_submission
  from public.mark_submissions
  where id=p_submission_id
  for update;
  if not found then raise exception 'Mark submission not found'; end if;

  select * into v_instance
  from public.assessment_instances
  where id=v_submission.assessment_instance_id
  for update;

  select so.subject_id into v_subject_id
  from public.subject_offerings so
  where so.id=v_instance.subject_offering_id;

  v_authorized:=
    app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_current_school_matches((select auth.uid()),v_instance.school_id)
      and not app_private.has_platform_role(array['platform_support'])
      and (
        app_private.has_school_role(
          v_instance.school_id,array['school_admin','principal','deputy_principal']
        )
        or app_private.hod_responsible_for_subject(v_instance.school_id,v_subject_id)
      )
    );
  if not v_authorized then raise exception 'Permission denied'; end if;
  if v_submission.status<>'submitted' then raise exception 'Submission has already been reviewed'; end if;
  if p_decision='return' and nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'A return reason is required';
  end if;

  v_was_correction:=v_instance.correction_pending;
  v_new_status:=case when p_decision='verify' then 'verified' else 'returned' end;

  update public.mark_submissions
     set status=v_new_status,
         reviewed_by_user_id=auth.uid(),
         reviewed_at=now(),
         review_note=nullif(btrim(coalesce(p_note,'')),'')
   where id=v_submission.id;

  update public.assessment_instances
     set status=v_new_status,
         correction_pending=case when p_decision='verify' then false else correction_pending end,
         correction_completed_at=case
           when p_decision='verify' and correction_pending then now()
           else correction_completed_at
         end,
         updated_at=now()
   where id=v_instance.id;

  if p_decision='verify' and v_was_correction then
    update public.assessment_mark_reopen_authorizations reopen
       set status='closed',
           closed_at=now(),
           closed_by_user_id=auth.uid(),
           close_reason='Correction re-verification completed'
     where reopen.status='active'
       and reopen.used_at is not null
       and (
         reopen.assessment_instance_id=v_instance.id
         or (
           reopen.scope_kind='subject_class'
           and reopen.tenant_id=v_instance.tenant_id
           and reopen.school_id=v_instance.school_id
           and reopen.subject_offering_id=v_instance.subject_offering_id
           and reopen.register_class_id=v_instance.register_class_id
           and reopen.term_number is not distinct from v_instance.term_number
           and not exists(
             select 1
             from public.assessment_instances pending
             where pending.tenant_id=v_instance.tenant_id
               and pending.school_id=v_instance.school_id
               and pending.subject_offering_id=v_instance.subject_offering_id
               and pending.register_class_id=v_instance.register_class_id
               and pending.term_number is not distinct from v_instance.term_number
               and pending.correction_pending=true
           )
         )
       );
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_instance.tenant_id,v_instance.school_id,auth.uid(),'assessment.reviewed',
    'assessment_instance',v_instance.id,
    jsonb_build_object(
      'submission_id',v_submission.id,
      'decision',p_decision,
      'note',nullif(btrim(coalesce(p_note,'')),''),
      'correction_reverification',v_was_correction
    )
  );
  return true;
end;
$$;

revoke all on function public.review_mark_submission(uuid,text,text)
  from public,anon;
grant execute on function public.review_mark_submission(uuid,text,text)
  to authenticated;

create or replace function public.reopen_assessment_for_correction(
  p_assessment_instance_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  raise exception
    'Use authorize_assessment_mark_correction with explicit scope, start, and expiry';
end;
$$;

revoke all on function public.reopen_assessment_for_correction(uuid,text)
  from public,anon;
grant execute on function public.reopen_assessment_for_correction(uuid,text)
  to authenticated;

create or replace function app_private.enforce_official_result_integrity()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_school_tenant uuid;
  v_enrolment record;
  v_offering record;
  v_previous public.official_results%rowtype;
begin
  if tg_op='DELETE' then
    raise exception 'Official result cannot be deleted; use governed correction workflow';
  end if;

  select tenant_id into v_school_tenant
  from public.schools
  where id=new.school_id;
  if v_school_tenant is null or new.tenant_id is distinct from v_school_tenant then
    raise exception 'Official result scope mismatch: school does not belong to tenant';
  end if;

  select tenant_id,school_id,academic_year,learner_id
    into v_enrolment
  from public.enrolments
  where id=new.enrolment_id;
  if not found
     or (new.tenant_id,new.school_id,new.academic_year,new.learner_id)
        is distinct from
        (v_enrolment.tenant_id,v_enrolment.school_id,v_enrolment.academic_year,v_enrolment.learner_id) then
    raise exception 'Official result scope mismatch: enrolment identity differs';
  end if;

  select tenant_id,school_id,academic_year
    into v_offering
  from public.subject_offerings
  where id=new.subject_offering_id;
  if not found
     or (new.tenant_id,new.school_id,new.academic_year)
        is distinct from
        (v_offering.tenant_id,v_offering.school_id,v_offering.academic_year) then
    raise exception 'Official result scope mismatch: subject offering differs';
  end if;

  if tg_op='INSERT' then
    if auth.uid() is not null
       and new.approved_by_user_id is distinct from auth.uid() then
      raise exception 'Official result approver must match authenticated actor';
    end if;
    if auth.uid() is not null
       and not app_private.can_manage_current_assessment_school(new.school_id) then
      raise exception 'Official result approver is not currently authorized for school';
    end if;
    if not app_private.user_is_academic_leader(
      new.approved_by_user_id,new.school_id
    ) then
      raise exception 'Official result approver is not authorized for school';
    end if;
    if new.superseded_at is not null or new.superseded_by_result_id is not null then
      raise exception 'A newly approved official result cannot already be superseded';
    end if;

    if new.supersedes_result_id is not null then
      select * into v_previous
      from public.official_results
      where id=new.supersedes_result_id;
      if not found
         or v_previous.enrolment_id is distinct from new.enrolment_id
         or v_previous.subject_offering_id is distinct from new.subject_offering_id
         or v_previous.term_number is distinct from new.term_number then
        raise exception 'Corrected official result must supersede the same learner subject term';
      end if;
      if new.correction_authorization_id is null then
        raise exception 'Corrected official result requires correction authorization provenance';
      end if;
    elsif new.correction_authorization_id is not null then
      raise exception 'Initial official result cannot carry correction authorization provenance';
    end if;

    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.school_id is distinct from old.school_id
     or new.academic_year is distinct from old.academic_year
     or new.enrolment_id is distinct from old.enrolment_id
     or new.learner_id is distinct from old.learner_id
     or new.subject_offering_id is distinct from old.subject_offering_id
     or new.term_number is distinct from old.term_number
     or new.result_value is distinct from old.result_value
     or new.result_status is distinct from old.result_status
     or new.symbol is distinct from old.symbol
     or new.assessment_scheme_key is distinct from old.assessment_scheme_key
     or new.assessment_scheme_version is distinct from old.assessment_scheme_version
     or new.academic_rule_set_key is distinct from old.academic_rule_set_key
     or new.academic_rule_set_version is distinct from old.academic_rule_set_version
     or new.calculation_snapshot is distinct from old.calculation_snapshot
     or new.approved_by_user_id is distinct from old.approved_by_user_id
     or new.approved_at is distinct from old.approved_at
     or new.locked_at is distinct from old.locked_at
     or new.grading_scale_key is distinct from old.grading_scale_key
     or new.grading_scale_version is distinct from old.grading_scale_version
     or new.created_at is distinct from old.created_at
     or new.supersedes_result_id is distinct from old.supersedes_result_id
     or new.correction_authorization_id is distinct from old.correction_authorization_id then
    raise exception 'Official result calculation and approval provenance are immutable';
  end if;

  if old.superseded_at is not null
     and new.superseded_at is distinct from old.superseded_at then
    raise exception 'Official result supersession time is immutable once recorded';
  end if;
  if old.superseded_by_result_id is not null
     and new.superseded_by_result_id is distinct from old.superseded_by_result_id then
    raise exception 'Official result supersession target is immutable once recorded';
  end if;
  if old.superseded_at is null and new.superseded_at is null
     and old.superseded_by_result_id is distinct from new.superseded_by_result_id then
    raise exception 'Official result cannot name a superseding result before supersession';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_official_result_integrity()
  from public,anon,authenticated;

create or replace function public.approve_official_subject_result(
  p_assessment_scheme_id uuid,
  p_enrolment_id uuid,
  p_term_number smallint,
  p_grading_scale_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_scheme public.assessment_schemes%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_scale public.grading_scales%rowtype;
  v_previous public.official_results%rowtype;
  v_calc jsonb;
  v_result numeric;
  v_symbol text;
  v_id uuid;
  v_required integer;
  v_verified integer;
  v_correction_authorization_id uuid;
  v_reissue_required boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_scheme
  from public.assessment_schemes
  where id=p_assessment_scheme_id;
  select * into v_enrolment
  from public.enrolments
  where id=p_enrolment_id;
  select * into v_scale
  from public.grading_scales
  where id=p_grading_scale_id;

  if v_scheme.id is null or v_enrolment.id is null or v_scale.id is null then
    raise exception 'Scheme, enrolment or grading scale not found';
  end if;
  if v_scheme.school_id<>v_enrolment.school_id
     or v_scale.school_id<>v_scheme.school_id then
    raise exception 'Academic scope mismatch';
  end if;
  if not app_private.can_manage_current_assessment_school(v_scheme.school_id) then
    raise exception 'Permission denied';
  end if;
  if v_scheme.status not in ('active','superseded') or v_scale.status<>'active' then
    raise exception 'Assessment scheme must be active or historical in-flight, and grading scale must be active';
  end if;
  if not (p_term_number=any(v_scheme.term_numbers)) then
    raise exception 'Assessment scheme is not applicable to term %',p_term_number;
  end if;

  select count(*) into v_required
  from public.assessment_instances ai
  join public.assessment_components ac on ac.id=ai.assessment_component_id
  where ai.assessment_scheme_id=v_scheme.id
    and ai.register_class_id=v_enrolment.register_class_id
    and ai.term_number=p_term_number
    and ai.status<>'cancelled'
    and ac.contributes_to_report=true
    and ac.required=true
    and p_term_number=any(ac.term_numbers);

  select count(*) into v_verified
  from public.assessment_instances ai
  join public.assessment_components ac on ac.id=ai.assessment_component_id
  where ai.assessment_scheme_id=v_scheme.id
    and ai.register_class_id=v_enrolment.register_class_id
    and ai.term_number=p_term_number
    and ai.status in ('verified','locked')
    and ai.correction_pending=false
    and ac.contributes_to_report=true
    and ac.required=true
    and p_term_number=any(ac.term_numbers);

  if v_required=0 or v_verified<>v_required then
    raise exception 'All required contributing assessments must be verified before official result approval';
  end if;

  v_calc:=public.calculate_subject_result(v_scheme.id,v_enrolment.id,p_term_number);
  if coalesce((v_calc->>'complete')::boolean,false)=false then
    raise exception 'Subject result is incomplete';
  end if;
  v_result:=round((v_calc->>'result_value')::numeric,v_scale.decimal_places);

  select gsb.symbol into v_symbol
  from public.grading_scale_bands gsb
  where gsb.grading_scale_id=v_scale.id
    and v_result>=gsb.minimum_value
    and (gsb.maximum_value is null or v_result<=gsb.maximum_value)
  order by gsb.minimum_value desc
  limit 1;
  if v_symbol is null then
    raise exception 'No grading band covers calculated result %',v_result;
  end if;

  select * into v_previous
  from public.official_results
  where enrolment_id=v_enrolment.id
    and subject_offering_id=v_scheme.subject_offering_id
    and term_number=p_term_number
    and superseded_at is null
  for update;

  if found then
    select reopen.id
      into v_correction_authorization_id
    from public.learner_marks mark
    join public.assessment_instances instance
      on instance.id=mark.assessment_instance_id
    join public.assessment_mark_reopen_authorizations reopen
      on reopen.id=mark.correction_authorization_id
    where mark.enrolment_id=v_enrolment.id
      and instance.assessment_scheme_id=v_scheme.id
      and instance.register_class_id=v_enrolment.register_class_id
      and instance.term_number=p_term_number
      and reopen.requires_reverification=true
      and mark.recorded_at>v_previous.approved_at
    order by mark.recorded_at desc,mark.id desc
    limit 1;

    if v_correction_authorization_id is null then
      raise exception 'Existing official result requires a governed corrected mark and re-verification before replacement';
    end if;

    select exists(
      select 1
      from public.report_card_snapshots snapshot
      where snapshot.enrolment_id=v_enrolment.id
        and snapshot.term_number=p_term_number
        and snapshot.status='published'
    ) into v_reissue_required;

    update public.official_results
       set superseded_at=now()
     where id=v_previous.id;
  end if;

  insert into public.official_results(
    tenant_id,school_id,academic_year,enrolment_id,learner_id,
    subject_offering_id,term_number,result_value,symbol,
    assessment_scheme_key,assessment_scheme_version,
    grading_scale_key,grading_scale_version,
    calculation_snapshot,approved_by_user_id,approved_at,locked_at,
    supersedes_result_id,correction_authorization_id
  ) values(
    v_scheme.tenant_id,v_scheme.school_id,v_enrolment.academic_year,
    v_enrolment.id,v_enrolment.learner_id,v_scheme.subject_offering_id,
    p_term_number,v_result,v_symbol,v_scheme.scheme_key,v_scheme.version,
    v_scale.scale_key,v_scale.version,
    v_calc||jsonb_build_object(
      'rounded_result',v_result,
      'symbol',v_symbol,
      'correction_authorization_id',v_correction_authorization_id,
      'supersedes_result_id',v_previous.id
    ),
    auth.uid(),now(),now(),
    v_previous.id,v_correction_authorization_id
  )
  returning id into v_id;

  if v_previous.id is not null then
    update public.official_results
       set superseded_by_result_id=v_id
     where id=v_previous.id;
  end if;

  update public.assessment_instances
     set status='locked',
         locked_at=coalesce(locked_at,now()),
         updated_at=now()
   where assessment_scheme_id=v_scheme.id
     and register_class_id=v_enrolment.register_class_id
     and term_number=p_term_number
     and status='verified';

  update public.mark_submissions ms
     set status='locked'
   where ms.assessment_instance_id in (
     select ai.id
     from public.assessment_instances ai
     where ai.assessment_scheme_id=v_scheme.id
       and ai.register_class_id=v_enrolment.register_class_id
       and ai.term_number=p_term_number
   )
     and ms.status='verified';

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_scheme.tenant_id,v_scheme.school_id,auth.uid(),
    case when v_previous.id is null then 'official_result.approved' else 'official_result.corrected' end,
    'official_result',v_id,
    jsonb_build_object(
      'enrolment_id',v_enrolment.id,
      'subject_offering_id',v_scheme.subject_offering_id,
      'term_number',p_term_number,
      'result',v_result,
      'symbol',v_symbol,
      'scheme_version',v_scheme.version,
      'grading_scale_version',v_scale.version,
      'supersedes_result_id',v_previous.id,
      'correction_authorization_id',v_correction_authorization_id,
      'report_reissue_required',v_reissue_required
    )
  );

  if v_reissue_required then
    insert into public.audit_events(
      tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
    ) values(
      v_scheme.tenant_id,v_scheme.school_id,auth.uid(),
      'report_card.reissue_required','official_result',v_id,
      jsonb_build_object(
        'enrolment_id',v_enrolment.id,
        'term_number',p_term_number,
        'superseded_result_id',v_previous.id,
        'corrected_result_id',v_id
      )
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.approve_official_subject_result(uuid,uuid,smallint,uuid)
  from public,anon;
grant execute on function public.approve_official_subject_result(uuid,uuid,smallint,uuid)
  to authenticated;

create or replace function public.build_report_card_snapshot_management_internal(
  p_enrolment_id uuid,
  p_term_number smallint,
  p_template_version text default 'SCOLAPRO_TERM_REPORT_V1'
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_enrol public.enrolments%rowtype;
  v_learner public.learners%rowtype;
  v_class public.register_classes%rowtype;
  v_grade public.grades%rowtype;
  v_term public.academic_terms%rowtype;
  v_results jsonb;
  v_attendance jsonb;
  v_progression jsonb;
  v_guardians jsonb;
  v_version integer;
  v_snapshot_id uuid;
  v_previous uuid;
  v_final_term_number smallint;
  v_expected_school_days integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;
  if btrim(coalesce(p_template_version,''))='' then raise exception 'Template version is required'; end if;

  select * into v_enrol from public.enrolments where id=p_enrolment_id;
  if not found then raise exception 'Enrolment not found'; end if;
  if not app_private.has_school_role(v_enrol.school_id,array['school_admin','principal','deputy_principal','hod'])
     and not app_private.has_platform_role(array['platform_admin']) then
    raise exception 'Permission denied';
  end if;

  select * into v_learner from public.learners where id=v_enrol.learner_id;
  select * into v_class from public.register_classes where id=v_enrol.register_class_id;
  select * into v_grade from public.grades where id=v_enrol.grade_id;

  select t.* into v_term
  from public.academic_terms t
  join public.academic_years y on y.id=t.academic_year_id
  where t.school_id=v_enrol.school_id
    and y.year=v_enrol.academic_year
    and t.term_number=p_term_number;

  select max(t.term_number)::smallint into v_final_term_number
  from public.academic_terms t
  join public.academic_years y on y.id=t.academic_year_id
  where t.school_id=v_enrol.school_id and y.year=v_enrol.academic_year;

  select coalesce(jsonb_agg(jsonb_build_object(
    'official_result_id',r.id,
    'subject_offering_id',r.subject_offering_id,
    'subject_code',s.subject_code,
    'subject_name',s.display_name,
    'result_value',r.result_value,
    'result_status',r.result_status,
    'symbol',r.symbol,
    'assessment_scheme_key',r.assessment_scheme_key,
    'assessment_scheme_version',r.assessment_scheme_version,
    'academic_rule_set_key',r.academic_rule_set_key,
    'academic_rule_set_version',r.academic_rule_set_version,
    'calculation_snapshot',r.calculation_snapshot,
    'approved_at',r.approved_at
  ) order by s.display_name),'[]'::jsonb)
  into v_results
  from public.official_results_current r
  join public.subject_offerings so on so.id=r.subject_offering_id
  join public.subjects s on s.id=so.subject_id
  where r.enrolment_id=v_enrol.id and r.term_number=p_term_number;

  if jsonb_array_length(v_results)=0 then
    raise exception 'No approved official results exist for this learner and term';
  end if;

  if v_term.id is not null and v_term.starts_on is not null and v_term.ends_on is not null then
    select count(*)::integer into v_expected_school_days
    from generate_series(v_term.starts_on,v_term.ends_on,interval '1 day') g(day)
    where app_private.is_expected_school_day(v_enrol.school_id,g.day::date)
      and g.day::date >= v_enrol.enrolled_from
      and (v_enrol.enrolled_to is null or g.day::date <= v_enrol.enrolled_to);
  else
    v_expected_school_days:=null;
  end if;

  select jsonb_build_object(
    'expected_school_days',v_expected_school_days,
    'recorded_school_days',count(*),
    'register_coverage_complete',case when v_expected_school_days is null then null else count(*)>=v_expected_school_days end,
    'present',count(*) filter(where status='present'),
    'absent',count(*) filter(where status='absent'),
    'late',count(*) filter(where status='late'),
    'excused',count(*) filter(where status='excused'),
    'unknown',count(*) filter(where status='unknown')
  ) into v_attendance
  from public.daily_register_current d
  where d.enrolment_id=v_enrol.id
    and (
      v_term.id is null
      or (
        (v_term.starts_on is null or d.attendance_date>=v_term.starts_on)
        and (v_term.ends_on is null or d.attendance_date<=v_term.ends_on)
      )
    );

  if v_final_term_number is not null and p_term_number=v_final_term_number then
    select jsonb_build_object(
      'outcome',outcome,
      'rule_set_key',rule_set_key,
      'rule_set_version',rule_set_version,
      'status',status,
      'rationale',rationale
    ) into v_progression
    from public.year_end_progressions
    where enrolment_id=v_enrol.id;
  else
    v_progression:=null;
  end if;

  v_guardians:=app_private.report_card_guardians_snapshot(v_enrol.learner_id);

  select id,snapshot_version into v_previous,v_version
  from public.report_card_snapshots
  where enrolment_id=v_enrol.id and term_number=p_term_number
  order by snapshot_version desc
  limit 1;
  v_version:=coalesce(v_version,0)+1;

  insert into public.report_card_snapshots(
    tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,
    template_version,snapshot_version,data_snapshot,generated_by_user_id,supersedes_snapshot_id
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id,v_enrol.id,v_enrol.academic_year,p_term_number,
    btrim(p_template_version),v_version,
    jsonb_build_object(
      'learner',jsonb_build_object(
        'id',v_learner.id,'first_names',v_learner.first_names,'surname',v_learner.surname,
        'preferred_name',v_learner.preferred_name,'date_of_birth',v_learner.date_of_birth,'sex',v_learner.sex
      ),
      'enrolment',jsonb_build_object(
        'id',v_enrol.id,'admission_number',v_enrol.admission_number,'academic_year',v_enrol.academic_year,
        'grade',v_grade.display_name,'register_class',v_class.display_name
      ),
      'term',jsonb_build_object(
        'number',p_term_number,'name',coalesce(v_term.display_name,'Term '||p_term_number),
        'starts_on',v_term.starts_on,'ends_on',v_term.ends_on,'is_final_term',v_final_term_number=p_term_number
      ),
      'results',v_results,
      'attendance',coalesce(v_attendance,'{}'::jsonb),
      'guardians',coalesce(v_guardians,'[]'::jsonb),
      'year_end_progression',v_progression
    ),
    auth.uid(),v_previous
  ) returning id into v_snapshot_id;

  if v_previous is not null then
    update public.report_card_snapshots
       set status='superseded'
     where id=v_previous and status='draft';
  end if;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_enrol.tenant_id,v_enrol.school_id,auth.uid(),
    'report_card.snapshot.generated','report_card_snapshot',v_snapshot_id,
    jsonb_build_object(
      'enrolment_id',v_enrol.id,
      'term_number',p_term_number,
      'snapshot_version',v_version,
      'guardian_count',jsonb_array_length(coalesce(v_guardians,'[]'::jsonb)),
      'expected_school_days',v_expected_school_days,
      'final_term_number',v_final_term_number
    )
  );

  return v_snapshot_id;
end;
$$;

revoke all on function public.build_report_card_snapshot_management_internal(uuid,smallint,text)
  from public,anon,authenticated;

comment on table public.assessment_mark_entry_windows is
'Governed mark-entry timing policy. Effective OPEN/CLOSING SOON/LOCKED state is derived at mutation time and remains separate from assessment moderation status.';
comment on table public.assessment_mark_reopen_authorizations is
'Bounded, expiring correction authority for one learner, one assessment component, or a subject/class scope. Every corrected mark links to the authorization that permitted it.';
comment on column public.learner_marks.correction_authorization_id is
'Non-null only for append-only mark revisions made through a governed correction reopen.';
comment on index public.official_results_current_subject_term_uidx is
'At most one non-superseded official result exists per learner, subject offering and term. Historical corrected results remain retrievable.';
comment on view public.official_results_current is
'Current non-superseded official results. Report-card generation uses this view so historical corrected results cannot duplicate a subject in a new snapshot.';
comment on function public.resolve_assessment_mark_entry_window(uuid) is
'Authenticated effective mark-entry state resolver. Returns OPEN, CLOSING_SOON, LOCKED, REOPENED, or LOCKED_AGAIN semantics plus policy timing and bounded learner reopen metadata.';
comment on function public.authorize_assessment_mark_correction(uuid,text,uuid,text,timestamptz,timestamptz,boolean) is
'Creates explicit bounded correction authority. HOD/current academic leadership may authorize learner/component corrections; subject-class scope requires stronger school leadership.';
comment on function public.approve_official_subject_result(uuid,uuid,smallint,uuid) is
'Approves an initial official subject result or, after governed corrected marks and re-verification, creates an immutable replacement linked to the superseded result. Published report cards remain immutable and are reissued through the existing report-card snapshot/version publication lifecycle.';
