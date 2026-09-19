-- Issue #546: statutory preparation is a current-school operational authority.
-- Preserve governed Platform Admin access and read-only network review while denying
-- Platform Support, older active non-current memberships, and stale linked placements.

create or replace function app_private.can_manage_statutory(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,app_private
as $$
  select auth.uid() is not null
    and (
      exists(
        select 1
        from public.platform_memberships pm
        where pm.user_id=auth.uid()
          and pm.role_key='platform_admin'
          and pm.active_from<=current_date
          and (pm.active_to is null or pm.active_to>=current_date)
      )
      or (
        app_private.user_targets_current_school(auth.uid(),target_school_id)
        and exists(
          select 1
          from public.school_memberships sm
          where sm.user_id=auth.uid()
            and sm.school_id=target_school_id
            and sm.role_key in ('school_admin','principal','deputy_principal','emis_officer')
            and sm.active_from<=current_date
            and (sm.active_to is null or sm.active_to>=current_date)
            and (
              sm.staff_member_id is null
              or app_private.staff_member_covers_school_period(
                sm.staff_member_id,
                target_school_id,
                current_date,
                current_date
              )
            )
        )
      )
    );
$$;

revoke all on function app_private.can_manage_statutory(uuid) from public,anon;
grant execute on function app_private.can_manage_statutory(uuid) to authenticated;

comment on function app_private.can_manage_statutory(uuid) is
'Current-school statutory preparation authority for effective school statutory roles, with governed Platform Admin access. Platform Support, non-current school roles, and stale linked staff placements are denied. Network review remains separately read-only.';

create or replace function app_private.enforce_statutory_certification_current_scope()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if new.certified_by_user_id is null
     or new.certified_by_user_id is distinct from auth.uid()
     or not app_private.user_targets_current_school(new.certified_by_user_id,new.school_id)
     or not exists(
       select 1
       from public.school_memberships sm
       where sm.user_id=new.certified_by_user_id
         and sm.school_id=new.school_id
         and sm.role_key=new.certification_role
         and sm.role_key in ('principal','school_admin')
         and sm.active_from<=current_date
         and (sm.active_to is null or sm.active_to>=current_date)
         and (
           sm.staff_member_id is null
           or app_private.staff_member_covers_school_period(
             sm.staff_member_id,
             new.school_id,
             current_date,
             current_date
           )
         )
     )
  then
    raise exception 'Certification role does not match your current effective school role';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_statutory_certification_current_scope()
from public,anon,authenticated;

drop trigger if exists statutory_certification_current_scope_trg
on public.statutory_certifications;
create trigger statutory_certification_current_scope_trg
before insert on public.statutory_certifications
for each row execute function app_private.enforce_statutory_certification_current_scope();

comment on function app_private.enforce_statutory_certification_current_scope() is
'Prevents certification evidence from being created through an older active non-current school role or a stale linked staff placement.';
