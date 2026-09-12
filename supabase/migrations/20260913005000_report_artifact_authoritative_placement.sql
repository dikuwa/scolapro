-- Generated report-card metadata and management are sensitive school-local surfaces.
-- Current-school scoping already prevents an older active school from reading snapshot/document
-- rows, but linked staff whose authoritative placement ended could still retain management
-- access through a stale school_memberships row. The Individual status SECURITY DEFINER RPC
-- also accepted any active school membership, including an older non-current school.

create or replace function app_private.user_has_effective_report_card_membership(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.school_memberships sm
    where sm.user_id = p_user_id
      and sm.school_id = p_school_id
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
      and (
        sm.staff_member_id is null
        or app_private.staff_member_covers_school_period(
          sm.staff_member_id,
          p_school_id,
          current_date,
          current_date
        )
      )
  );
$$;

revoke all on function app_private.user_has_effective_report_card_membership(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_has_effective_report_card_membership(uuid,uuid) is
'Report-card school-membership predicate with authoritative linked staff-placement precedence; unlinked/legacy membership remains valid where no governed placement applies.';

create or replace function app_private.user_has_effective_report_card_school_role(
  p_user_id uuid,
  p_school_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.school_memberships sm
    where sm.user_id = p_user_id
      and sm.school_id = p_school_id
      and sm.role_key = any(p_roles)
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
      and (
        sm.staff_member_id is null
        or app_private.staff_member_covers_school_period(
          sm.staff_member_id,
          p_school_id,
          current_date,
          current_date
        )
      )
  );
$$;

revoke all on function app_private.user_has_effective_report_card_school_role(uuid,uuid,text[])
  from public, anon, authenticated;

comment on function app_private.user_has_effective_report_card_school_role(uuid,uuid,text[]) is
'Report-card role predicate that prevents stale linked school membership from outliving authoritative staff placement.';

create or replace function app_private.user_can_read_report_card_as_teaching_staff(
  p_user_id uuid,
  p_school_id uuid,
  p_learner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_targets_current_school(p_user_id,p_school_id)
    and exists (
      select 1
      from public.enrolments e
      left join public.register_classes rc on rc.id = e.register_class_id
      left join public.staff_members register_staff on register_staff.id = rc.register_teacher_staff_id
      where e.school_id = p_school_id
        and e.learner_id = p_learner_id
        and e.status = 'current'
        and e.enrolled_from <= current_date
        and (e.enrolled_to is null or e.enrolled_to >= current_date)
        and (
          (
            register_staff.user_id = p_user_id
            and register_staff.status = 'active'
            and app_private.staff_member_covers_school_period(
              register_staff.id,
              p_school_id,
              current_date,
              current_date
            )
            and app_private.user_has_effective_report_card_school_role(
              p_user_id,
              p_school_id,
              array['class_teacher']::text[]
            )
          )
          or exists (
            select 1
            from public.teacher_allocations ta
            join public.staff_members teacher_staff on teacher_staff.id = ta.staff_member_id
            where ta.school_id = p_school_id
              and ta.register_class_id = e.register_class_id
              and ta.academic_year = e.academic_year
              and ta.active_from <= current_date
              and (ta.active_to is null or ta.active_to >= current_date)
              and teacher_staff.user_id = p_user_id
              and teacher_staff.status = 'active'
              and app_private.staff_member_covers_school_period(
                teacher_staff.id,
                p_school_id,
                current_date,
                current_date
              )
          )
        )
    );
$$;

revoke all on function app_private.user_can_read_report_card_as_teaching_staff(uuid,uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_read_report_card_as_teaching_staff(uuid,uuid,uuid) is
'Report-card teaching read authority only: deterministic current school plus current learner enrolment and current class-teacher/teacher allocation with authoritative staff placement. It deliberately excludes broad learner-observation leadership/counsellor authority.';

create or replace function app_private.user_can_manage_report_cards(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists(
      select 1
      from public.platform_memberships pm
      where pm.user_id = p_user_id
        and pm.role_key = 'platform_admin'
        and pm.active_from <= current_date
        and (pm.active_to is null or pm.active_to >= current_date)
    )
    or (
      app_private.user_targets_current_school(p_user_id,p_school_id)
      and app_private.user_has_effective_report_card_school_role(
        p_user_id,
        p_school_id,
        array['school_admin','principal','deputy_principal']::text[]
      )
    );
$$;

revoke all on function app_private.user_can_manage_report_cards(uuid,uuid)
  from public, anon, authenticated;

comment on function app_private.user_can_manage_report_cards(uuid,uuid) is
'Report-card mutation authority: governed Platform Admin, or current-school leadership with authoritative linked staff placement.';

create or replace function app_private.can_read_report_card_snapshot(
  p_school_id uuid,
  p_learner_id uuid,
  p_status text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_targets_current_school(auth.uid(),p_school_id)
      and app_private.user_has_effective_report_card_school_role(
        auth.uid(),
        p_school_id,
        array['school_admin','principal','deputy_principal','hod']::text[]
      )
    )
    or app_private.user_can_read_report_card_as_teaching_staff(
      auth.uid(),
      p_school_id,
      p_learner_id
    )
    or (
      p_status = 'published'
      and exists (
        select 1
        from public.learner_guardians lg
        join public.guardian_user_links gul on gul.guardian_id = lg.guardian_id
        where lg.learner_id = p_learner_id
          and lg.effective_from <= current_date
          and (lg.effective_to is null or lg.effective_to >= current_date)
          and gul.user_id = auth.uid()
      )
    );
$$;

revoke all on function app_private.can_read_report_card_snapshot(uuid,uuid,text)
  from public, anon;
grant execute on function app_private.can_read_report_card_snapshot(uuid,uuid,text)
  to authenticated;

comment on function app_private.can_read_report_card_snapshot(uuid,uuid,text) is
'Report-card read predicate preserving Platform Admin, current leadership/HOD, assigned teaching staff and current published guardian access while preventing broad learner-observation authority from bypassing report-card placement rules.';

create or replace function public.get_report_card_status_for_enrolment(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number integer,
  p_enrolment_id uuid
)
returns table(
  enrolment_id uuid,
  learner_id uuid,
  first_names text,
  surname text,
  admission_number text,
  grade_id uuid,
  grade_name text,
  register_class_id uuid,
  class_name text,
  snapshot_id uuid,
  snapshot_version integer,
  template_version text,
  report_status text,
  generated_at timestamptz,
  certified_at timestamptz,
  pdf_ready boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    app_private.has_platform_role(array['platform_admin'])
    or (
      app_private.user_targets_current_school(auth.uid(),p_school_id)
      and app_private.user_has_effective_report_card_membership(auth.uid(),p_school_id)
    )
  ) then
    raise exception 'Permission denied';
  end if;

  if p_academic_year < 2000 or p_academic_year > 2200 then
    raise exception 'Academic year is invalid';
  end if;
  if p_term_number < 1 or p_term_number > 6 then
    raise exception 'Term number is invalid';
  end if;

  return query
  select
    e.id as enrolment_id,
    e.learner_id,
    l.first_names,
    l.surname,
    e.admission_number,
    e.grade_id,
    coalesce(g.display_name,'Unassigned') as grade_name,
    e.register_class_id,
    coalesce(rc.display_name,'Unassigned') as class_name,
    rs.id as snapshot_id,
    rs.snapshot_version,
    rs.template_version,
    case
      when rs.id is null then 'not_generated'
      when rs.status = 'draft' then 'generated'
      when rs.status = 'published' then 'published'
      else 'certified'
    end as report_status,
    rs.generated_at,
    rs.certified_at,
    case when rs.id is null then false else exists(
      select 1
      from public.report_card_documents d
      where d.snapshot_id = rs.id
        and d.school_id = p_school_id
        and d.document_format = 'pdf'
        and d.status = 'ready'
    ) end as pdf_ready
  from public.enrolments e
  join public.learners l on l.id = e.learner_id
  left join public.grades g on g.id = e.grade_id
  left join public.register_classes rc on rc.id = e.register_class_id
  left join lateral (
    select s.id,s.snapshot_version,s.template_version,s.status,s.generated_at,s.certified_at
    from public.report_card_snapshots s
    where s.school_id = p_school_id
      and s.academic_year = p_academic_year
      and s.enrolment_id = e.id
      and s.term_number = p_term_number
      and s.status <> 'superseded'
      and app_private.can_read_report_card_snapshot(s.school_id,s.learner_id,s.status)
    order by s.snapshot_version desc
    limit 1
  ) rs on true
  where e.id = p_enrolment_id
    and e.school_id = p_school_id
    and e.academic_year = p_academic_year
    and e.status = 'current'
  limit 1;
end;
$$;

revoke all on function public.get_report_card_status_for_enrolment(uuid,integer,integer,uuid)
  from public, anon;
grant execute on function public.get_report_card_status_for_enrolment(uuid,integer,integer,uuid)
  to authenticated;

comment on function public.get_report_card_status_for_enrolment(uuid,integer,integer,uuid) is
'Exact current-enrolment report-card status read. School callers must target their deterministic current school and retain effective linked placement; governed Platform Admin access is preserved.';
