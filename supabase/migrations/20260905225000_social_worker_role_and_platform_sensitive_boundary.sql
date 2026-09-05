-- Mature the school-level safeguarding role model and tighten the platform boundary.
--
-- 1. A school social worker / safeguarding-authorized user is semantically distinct
--    from a general counsellor: add `social_worker` to the canonical support-role
--    helpers and to the governed school-invitation role catalogue. It is a SCHOOL
--    role, never a platform role.
--
-- 2. Platform administration operates ScolaPro as software; it must not inherit
--    confidential learner-support / restricted-CRC reading rights merely because it
--    manages the SaaS. Platform Admin therefore no longer counts as an explicit
--    support role. Standard-tier educational records (conduct, achievement,
--    development observations) are unchanged: those are not confidential CRC tiers.

create or replace function app_private.has_explicit_support_role(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select exists(
    select 1 from public.school_memberships sm
    where sm.school_id=p_school_id
      and sm.user_id=(select auth.uid())
      and sm.role_key in ('counsellor','learner_support','social_worker')
      and sm.active_from<=current_date
      and (sm.active_to is null or sm.active_to>=current_date)
  );
$$;
revoke all on function app_private.has_explicit_support_role(uuid) from public,anon,authenticated;

comment on function app_private.has_explicit_support_role(uuid) is
'Explicit school-level counselling/safeguarding authority (counsellor, learner support, social worker). Platform administration is deliberately excluded: operating the SaaS does not grant confidential learner-case access.';

create or replace function app_private.user_has_explicit_support_role(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=p_user_id
        and sm.role_key in ('counsellor','learner_support','social_worker')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    );
$$;

revoke all on function app_private.user_has_explicit_support_role(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_has_explicit_support_role(uuid,uuid) is
'Arbitrary-user mirror of has_explicit_support_role for physical provenance guards; excludes platform administration from confidential support access.';

-- Social workers share the standard learner-observation tier (observations,
-- referrals and routine cumulative notes) so they can contribute alongside
-- counsellors without receiving the confidential case content itself.
create or replace function app_private.can_access_learner_observations(
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=(select auth.uid())
        and sm.role_key in ('school_admin','principal','deputy_principal','counsellor','social_worker')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
    or exists(
      select 1
      from public.enrolments e
      left join public.register_classes rc on rc.id=e.register_class_id
      left join public.staff_members register_staff on register_staff.id=rc.register_teacher_staff_id
      where e.school_id=p_school_id
        and e.learner_id=p_learner_id
        and e.status='current'
        and e.enrolled_from<=current_date
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
        and (
          (
            register_staff.user_id=(select auth.uid())
            and register_staff.status='active'
            and exists(
              select 1 from public.school_memberships sm
              where sm.school_id=p_school_id
                and sm.user_id=(select auth.uid())
                and sm.role_key='class_teacher'
                and sm.active_from<=current_date
                and (sm.active_to is null or sm.active_to>=current_date)
            )
          )
          or exists(
            select 1
            from public.teacher_allocations ta
            join public.staff_members teacher_staff on teacher_staff.id=ta.staff_member_id
            where ta.school_id=p_school_id
              and ta.register_class_id=e.register_class_id
              and ta.academic_year=e.academic_year
              and ta.active_from<=current_date
              and (ta.active_to is null or ta.active_to>=current_date)
              and teacher_staff.user_id=(select auth.uid())
              and teacher_staff.status='active'
              and app_private.staff_member_has_school_assignment(
                teacher_staff.id,
                p_school_id,
                current_date
              )
          )
        )
    );
$$;

revoke all on function app_private.can_access_learner_observations(uuid,uuid)
from public,anon;
grant execute on function app_private.can_access_learner_observations(uuid,uuid)
to authenticated;

comment on function app_private.can_access_learner_observations(uuid,uuid) is
'Learner-observation access is limited to Platform Admin (standard educational tier only), current authorised school leadership/counselling/social-work, or current class/teacher scope for a learner whose school enrolment is effective today; teacher-allocation access also requires current governed staff placement.';

create or replace function app_private.user_can_access_learner_observations(
  p_user_id uuid,
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id=p_user_id
        and pm.role_key='platform_admin'
        and pm.active_from<=current_date
        and (pm.active_to is null or pm.active_to>=current_date)
    )
    or exists(
      select 1
      from public.school_memberships sm
      where sm.school_id=p_school_id
        and sm.user_id=p_user_id
        and sm.role_key in ('school_admin','principal','deputy_principal','counsellor','social_worker')
        and sm.active_from<=current_date
        and (sm.active_to is null or sm.active_to>=current_date)
    )
    or exists(
      select 1
      from public.enrolments e
      left join public.register_classes rc on rc.id=e.register_class_id
      left join public.staff_members register_staff on register_staff.id=rc.register_teacher_staff_id
      where e.school_id=p_school_id
        and e.learner_id=p_learner_id
        and e.status='current'
        and e.enrolled_from<=current_date
        and (e.enrolled_to is null or e.enrolled_to>=current_date)
        and (
          (
            register_staff.user_id=p_user_id
            and register_staff.status='active'
            and exists(
              select 1
              from public.school_memberships sm
              where sm.school_id=p_school_id
                and sm.user_id=p_user_id
                and sm.role_key='class_teacher'
                and sm.active_from<=current_date
                and (sm.active_to is null or sm.active_to>=current_date)
            )
          )
          or exists(
            select 1
            from public.teacher_allocations ta
            join public.staff_members teacher_staff on teacher_staff.id=ta.staff_member_id
            where ta.school_id=p_school_id
              and ta.register_class_id=e.register_class_id
              and ta.academic_year=e.academic_year
              and ta.active_from<=current_date
              and (ta.active_to is null or ta.active_to>=current_date)
              and teacher_staff.user_id=p_user_id
              and teacher_staff.status='active'
              and app_private.staff_member_has_school_assignment(
                teacher_staff.id,
                p_school_id,
                current_date
              )
          )
        )
    );
$$;

revoke all on function app_private.user_can_access_learner_observations(uuid,uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_access_learner_observations(uuid,uuid,uuid) is
'Private arbitrary-actor equivalent of can_access_learner_observations (including the social-worker role), used only by physical provenance guards where auth.uid() cannot safely represent the recorded actor.';

-- School invitations may now onboard a social worker / safeguarding role, but never
-- a platform-level role.
create or replace function public.create_school_invitation(
  p_school_id uuid,
  p_email text,
  p_first_name text default null,
  p_last_name text default null,
  p_employee_number text default null,
  p_role_key text default 'school_admin'
)
returns table(invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_school public.schools%rowtype;
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_school
  from public.schools
  where id = p_school_id
    and status = 'active';

  if not found then
    raise exception 'School not found or inactive';
  end if;

  if not app_private.can_manage_school_members(p_school_id) then
    raise exception 'Permission denied';
  end if;

  if p_role_key not in (
    'school_admin','principal','deputy_principal','hod','teacher','class_teacher',
    'counsellor','social_worker','librarian','board_member'
  ) then
    raise exception 'Unsupported school role';
  end if;

  if btrim(coalesce(p_email, '')) = '' then
    raise exception 'Email is required';
  end if;

  update public.school_invitations
  set status = 'expired'
  where school_id = p_school_id
    and lower(btrim(email)) = lower(btrim(p_email))
    and role_key = p_role_key
    and status = 'pending'
    and expires_at <= now();

  if exists (
    select 1
    from public.school_invitations
    where school_id = p_school_id
      and lower(btrim(email)) = lower(btrim(p_email))
      and role_key = p_role_key
      and status = 'pending'
      and expires_at > now()
  ) then
    raise exception 'A pending invitation already exists for this email and role';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires_at := now() + interval '7 days';

  insert into public.school_invitations (
    tenant_id, school_id, email, first_name, last_name, employee_number,
    role_key, token_hash, invited_by_user_id, expires_at
  )
  values (
    v_school.tenant_id,
    p_school_id,
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_first_name, '')), ''),
    nullif(btrim(coalesce(p_last_name, '')), ''),
    nullif(btrim(coalesce(p_employee_number, '')), ''),
    p_role_key,
    encode(digest(v_token, 'sha256'), 'hex'),
    auth.uid(),
    v_expires_at
  )
  returning id into v_invitation_id;

  insert into public.audit_events (
    tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata
  )
  values (
    v_school.tenant_id,
    p_school_id,
    auth.uid(),
    'school_invitation.created',
    'school_invitation',
    v_invitation_id,
    jsonb_build_object('email', lower(btrim(p_email)), 'role_key', p_role_key)
  );

  return query select v_invitation_id, v_token, v_expires_at;
end;
$$;

revoke all on function public.create_school_invitation(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.create_school_invitation(uuid,text,text,text,text,text) to authenticated;

comment on function public.create_school_invitation(uuid,text,text,text,text,text) is
'Creates a governed school-scoped invitation. The role catalogue contains school roles only (including social worker); platform roles are never invitable through this function.';

-- Invitation acceptance maps the social-worker login role to a support placement.
create or replace function public.accept_school_invitation(p_token text)
returns table(school_id uuid, role_key text)
language plpgsql
security definer
set search_path = public, extensions, app_private
as $$
declare
  v_invite public.school_invitations%rowtype;
  v_user_email text;
  v_staff public.staff_members%rowtype;
  v_staff_id uuid;
  v_assignment_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_user_email = '' then raise exception 'Authenticated account has no email'; end if;

  select * into v_invite
  from public.school_invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and status = 'pending'
  for update;
  if not found then raise exception 'Invitation is invalid or no longer available'; end if;
  if v_invite.expires_at <= now() then
    update public.school_invitations set status='expired' where id=v_invite.id;
    raise exception 'Invitation has expired';
  end if;
  if lower(btrim(v_invite.email)) <> v_user_email then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  select * into v_staff
  from public.staff_members
  where tenant_id=v_invite.tenant_id and user_id=auth.uid()
  order by created_at asc
  limit 1;

  if not found and nullif(btrim(coalesce(v_invite.employee_number,'')),'') is not null then
    select * into v_staff
    from public.staff_members
    where tenant_id=v_invite.tenant_id
      and upper(btrim(employee_number))=upper(btrim(v_invite.employee_number))
    order by created_at asc
    limit 1
    for update;

    if found then
      if v_staff.user_id is not null and v_staff.user_id<>auth.uid() then
        raise exception 'Employee number is already linked to another account';
      end if;
      if v_invite.first_name is not null and lower(btrim(v_staff.first_name))<>lower(btrim(v_invite.first_name)) then
        raise exception 'Invitation employee number conflicts with the existing staff first name';
      end if;
      if v_invite.last_name is not null and lower(btrim(v_staff.last_name))<>lower(btrim(v_invite.last_name)) then
        raise exception 'Invitation employee number conflicts with the existing staff surname';
      end if;
      update public.staff_members
      set user_id=auth.uid(),updated_at=now()
      where id=v_staff.id and user_id is null;
    end if;
  end if;

  if v_staff.id is null then
    insert into public.staff_members(tenant_id,user_id,employee_number,first_name,last_name,status)
    values(
      v_invite.tenant_id,
      auth.uid(),
      nullif(upper(btrim(coalesce(v_invite.employee_number,''))),''),
      coalesce(v_invite.first_name,split_part(v_invite.email,'@',1)),
      coalesce(v_invite.last_name,''),
      'active'
    )
    returning * into v_staff;
  end if;
  v_staff_id:=v_staff.id;

  insert into public.user_profiles(user_id,display_name)
  values(auth.uid(),nullif(btrim(concat_ws(' ',v_invite.first_name,v_invite.last_name)),''))
  on conflict(user_id) do update
  set display_name=coalesce(public.user_profiles.display_name,excluded.display_name),updated_at=now();

  insert into public.school_memberships(tenant_id,school_id,user_id,staff_member_id,role_key,active_from)
  values(v_invite.tenant_id,v_invite.school_id,auth.uid(),v_staff_id,v_invite.role_key,current_date)
  on conflict do nothing;

  v_assignment_type:=case
    when v_invite.role_key in ('teacher','class_teacher') then 'teacher'
    when v_invite.role_key in ('school_admin','principal','deputy_principal','hod') then 'management'
    when v_invite.role_key in ('counsellor','social_worker','librarian') then 'support'
    else 'staff'
  end;

  if not exists(
    select 1 from public.staff_school_assignments ssa
    where ssa.school_id=v_invite.school_id
      and ssa.staff_member_id=v_staff_id
      and ssa.effective_from<=current_date
      and (ssa.effective_to is null or ssa.effective_to>=current_date)
  ) then
    insert into public.staff_school_assignments(
      tenant_id,school_id,staff_member_id,assignment_type,position_title,effective_from,created_by_user_id
    ) values(
      v_invite.tenant_id,v_invite.school_id,v_staff_id,v_assignment_type,null,current_date,auth.uid()
    );
  end if;

  update public.school_invitations
  set status='accepted',accepted_at=now(),accepted_user_id=auth.uid()
  where id=v_invite.id;

  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_invite.tenant_id,v_invite.school_id,auth.uid(),'school_invitation.accepted','school_invitation',v_invite.id,
    jsonb_build_object('role_key',v_invite.role_key,'staff_member_id',v_staff_id));

  return query select v_invite.school_id,v_invite.role_key;
end;
$$;

revoke all on function public.accept_school_invitation(text) from public,anon;
grant execute on function public.accept_school_invitation(text) to authenticated;

comment on function public.accept_school_invitation(text) is
'Accepts a school role invitation (including social worker), deterministically reuses an existing tenant staff identity by employee number before creating a new one, and ensures an effective school placement.';