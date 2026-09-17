-- Stream D / Wave 3: HOD teaching-review oversight layer.
--
-- Adds the HOD department/subject responsibility model and an append-only
-- preparation submission/review provenance layer on top of the existing
-- teaching planning engine. The teacher preparation authoring path
-- (lesson_preparations / teaching_actuals and the can_access_teaching_plan
-- helper) is intentionally left untouched so teacher preparation and
-- submission remain separate, and so existing preparation-authority tests
-- keep their behaviour. This migration introduces the oversight layer only:
-- HOD visibility/review follows assigned department/subject responsibility;
-- review events preserve history instead of overwriting the preparation;
-- Platform Support remains excluded; ended/stale placement loses current
-- operational authority; another active non-current school cannot expose
-- teaching plans. No Ministry moderation frequency, deadlines, scoring or
-- forms are introduced.

-- 1. HOD department/subject responsibility --------------------------------
--
-- Reuses the authoritative HOD school membership -> staff_member_id ->
-- effective-dated staff_school_assignments chain (the same pattern N20
-- control forms use). No parallel department membership or copied staff
-- identity is introduced. Responsibility is anchored on the cross-grade
-- school subject (public.subjects) so a single effective-dated row covers
-- every grade offering of that subject in the school.
create table if not exists public.subject_department_responsibilities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  department_head_staff_assignment_id uuid not null references public.staff_school_assignments(id) on delete restrict,
  effective_from date not null default current_date,
  effective_to date,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, subject_id, department_head_staff_assignment_id, effective_from),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists subject_department_responsibilities_subject_idx
  on public.subject_department_responsibilities (school_id, subject_id, effective_from, effective_to);
create index if not exists subject_department_responsibilities_assignment_idx
  on public.subject_department_responsibilities (department_head_staff_assignment_id, effective_from desc);

alter table public.subject_department_responsibilities enable row level security;

create policy "school members read subject department responsibilities"
  on public.subject_department_responsibilities for select to authenticated
  using (app_private.has_school_access(school_id));

create policy "school leaders manage subject department responsibilities"
  on public.subject_department_responsibilities for all to authenticated
  using (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal'])
  )
  with check (
    app_private.has_platform_role(array['platform_admin'])
    or app_private.has_school_role(school_id, array['school_admin','principal','deputy_principal'])
  );

-- 2. Preparation submission grouping -------------------------------------
--
-- A submission is a separate object from the teacher-owned preparation
-- content. It groups one or more lesson_preparations (selected
-- preparations, a week, or a term) submitted to HOD review. The current
-- status column is a convenience snapshot; the authoritative lifecycle
-- history lives in preparation_review_events (append-only). Review actions
-- never update lesson_preparations, so teacher preparation and submission
-- remain separate and history is preserved.
create table if not exists public.preparation_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  submitted_by_user_id uuid not null references auth.users(id) on delete restrict,
  scope_kind text not null check (scope_kind in ('selected_preparations','week','term')),
  term_label text,
  week_start date,
  week_end date,
  status text not null default 'submitted' check (status in ('submitted','reviewed','returned')),
  submitted_at timestamptz not null default now(),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (week_end is null or week_start is null or week_end >= week_start),
  check (scope_kind <> 'week' or (week_start is not null and week_end is not null))
);

create index if not exists preparation_submissions_school_year_idx
  on public.preparation_submissions (school_id, academic_year, status);
create index if not exists preparation_submissions_submitter_idx
  on public.preparation_submissions (submitted_by_user_id, created_at desc);

create table if not exists public.preparation_submission_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  preparation_submission_id uuid not null references public.preparation_submissions(id) on delete cascade,
  lesson_preparation_id uuid not null references public.lesson_preparations(id) on delete restrict,
  preparation_status_snapshot text not null default 'prepared'
    check (preparation_status_snapshot in ('draft','prepared','submitted','reviewed','returned','archived')),
  created_at timestamptz not null default now(),
  unique (preparation_submission_id, lesson_preparation_id)
);

create index if not exists preparation_submission_items_preparation_idx
  on public.preparation_submission_items (lesson_preparation_id);
create index if not exists preparation_submission_items_submission_idx
  on public.preparation_submission_items (preparation_submission_id);

-- 3. Append-only review event history ------------------------------------
--
-- Preserves the full submission/review/return/comment history. The teacher
-- preparation content is never overwritten by a review action. The
-- reviewer's placement is captured at event time so historical review
-- provenance survives later placement changes (ended/stale placement loses
-- current authority but cannot rewrite history).
create table if not exists public.preparation_review_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  preparation_submission_id uuid not null references public.preparation_submissions(id) on delete cascade,
  event_kind text not null check (event_kind in ('submitted','reviewed','returned','commented')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role_snapshot text not null check (actor_role_snapshot in
    ('platform_admin','school_admin','principal','deputy_principal','hod','teacher','class_teacher')),
  actor_staff_member_id uuid,
  actor_staff_assignment_id uuid references public.staff_school_assignments(id) on delete set null,
  comment text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists preparation_review_events_submission_idx
  on public.preparation_review_events (preparation_submission_id, occurred_at);
create index if not exists preparation_review_events_actor_idx
  on public.preparation_review_events (actor_user_id, occurred_at desc);

alter table public.preparation_submissions enable row level security;
alter table public.preparation_submission_items enable row level security;
alter table public.preparation_review_events enable row level security;

-- 4. HOD department/subject responsibility helper -------------------------
--
-- Bounded HOD oversight predicate for the review/readiness layer. Platform
-- Admin retains cross-school scope; Platform Support is excluded because
-- the platform branch is admin-only and the school-role branch uses
-- has_school_role (which excludes platform_support). Current-school is
-- enforced through user_current_school_matches so another active
-- non-current school cannot expose teaching plans. The HOD must hold a
-- current school membership with a staff_member_id linked to an effective
-- staff_school_assignment that carries an active subject_department
-- responsibility for the target subject. Ended/stale placement fails this
-- predicate and therefore loses current operational authority.
create or replace function app_private.hod_responsible_for_subject(
  p_school_id uuid,
  p_subject_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.has_platform_role(array['platform_admin'])
    or (
      p_subject_id is not null
      and app_private.user_current_school_matches((select auth.uid()), p_school_id)
      and exists (
        select 1
        from public.school_memberships sm
        join public.staff_members staff
          on staff.id = sm.staff_member_id
         and staff.user_id = auth.uid()
         and staff.status = 'active'
        join public.staff_school_assignments ssa
          on ssa.staff_member_id = sm.staff_member_id
         and ssa.school_id = sm.school_id
         and ssa.tenant_id = sm.tenant_id
         and ssa.effective_from <= current_date
         and (ssa.effective_to is null or ssa.effective_to >= current_date)
        join public.subject_department_responsibilities sdr
          on sdr.department_head_staff_assignment_id = ssa.id
         and sdr.school_id = p_school_id
         and sdr.subject_id = p_subject_id
         and sdr.tenant_id = sm.tenant_id
         and sdr.effective_from <= current_date
         and (sdr.effective_to is null or sdr.effective_to >= current_date)
        where sm.school_id = p_school_id
          and sm.user_id = auth.uid()
          and sm.role_key = 'hod'
          and sm.staff_member_id is not null
          and sm.active_from <= current_date
          and (sm.active_to is null or sm.active_to >= current_date)
      )
    );
$$;
revoke all on function app_private.hod_responsible_for_subject(uuid,uuid) from public, anon;
grant execute on function app_private.hod_responsible_for_subject(uuid,uuid) to authenticated;

comment on function app_private.hod_responsible_for_subject(uuid,uuid) is
'HOD oversight predicate for the teaching review/readiness layer. Platform Admin or current-school HOD with an active staff_school_assignment carrying an active subject_department_responsibility for the target subject. Platform Support is excluded; ended/stale placement loses authority.';

-- Resolve the set of subject_ids an HOD is currently responsible for at a
-- school. Used to bound readiness and review visibility to the HOD's own
-- department/subject responsibility without leaking across departments.
create or replace function app_private.hod_responsible_subjects(p_school_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select distinct sdr.subject_id
  from public.subject_department_responsibilities sdr
  join public.staff_school_assignments ssa
    on ssa.id = sdr.department_head_staff_assignment_id
   and ssa.school_id = sdr.school_id
   and ssa.effective_from <= current_date
   and (ssa.effective_to is null or ssa.effective_to >= current_date)
  join public.school_memberships sm
    on sm.school_id = ssa.school_id
   and sm.staff_member_id = ssa.staff_member_id
   and sm.user_id = auth.uid()
   and sm.role_key = 'hod'
   and sm.active_from <= current_date
   and (sm.active_to is null or sm.active_to >= current_date)
  join public.staff_members staff
    on staff.id = sm.staff_member_id
   and staff.user_id = auth.uid()
   and staff.status = 'active'
  where sdr.school_id = p_school_id
    and sdr.effective_from <= current_date
    and (sdr.effective_to is null or sdr.effective_to >= current_date)
    and app_private.user_current_school_matches((select auth.uid()), p_school_id);
$$;
revoke all on function app_private.hod_responsible_subjects(uuid) from public, anon;
grant execute on function app_private.hod_responsible_subjects(uuid) to authenticated;

-- 5. Authority helper for review actions ---------------------------------
--
-- True when the current user may review/return a preparation submission.
-- Platform Admin, or current-school school leadership (school-wide), or
-- current-school HOD responsible for every subject touched by the
-- submission. Platform Support is excluded by construction (admin-only
-- platform branch + has_school_role).
create or replace function app_private.can_review_preparation_submission(
  p_submission_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with submission_subjects as (
    select ps.school_id, so.subject_id
    from public.preparation_submissions ps
    join public.preparation_submission_items psi on psi.preparation_submission_id = ps.id
    join public.lesson_preparations lp on lp.id = psi.lesson_preparation_id
    join public.teaching_schedule_items tsi on tsi.id = lp.teaching_schedule_item_id
    join public.teacher_allocations ta on ta.id = tsi.teacher_allocation_id
    join public.subject_offerings so on so.id = ta.subject_offering_id
    where ps.id = p_submission_id
  )
  select app_private.has_platform_role(array['platform_admin'])
    or (
      exists (select 1 from submission_subjects)
      and app_private.user_current_school_matches((select auth.uid()), (select school_id from submission_subjects limit 1))
      and (
        app_private.has_school_role(
          (select school_id from submission_subjects limit 1),
          array['school_admin','principal','deputy_principal']
        )
        or not exists (
          select 1
          from submission_subjects ss
          where not app_private.hod_responsible_for_subject(ss.school_id, ss.subject_id)
        )
      )
    );
$$;
revoke all on function app_private.can_review_preparation_submission(uuid) from public, anon;
grant execute on function app_private.can_review_preparation_submission(uuid) to authenticated;

-- 6. RLS for submissions / items / events --------------------------------
-- Read access uses the same subject responsibility boundary as review.
-- Mutations must use the RPCs: direct writes would bypass per-item ownership,
-- non-empty submission validation and append-only lifecycle provenance.
-- The current-school helper is private to governed functions, so evaluate
-- the complete read predicate here rather than granting clients that helper.
create or replace function app_private.can_read_preparation_submission(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1 from public.preparation_submissions ps
    where ps.id = p_submission_id
      and (
        app_private.can_review_preparation_submission(ps.id)
        or (
          app_private.user_current_school_matches((select auth.uid()), ps.school_id)
          and app_private.has_school_role(ps.school_id, array['teacher','class_teacher','hod'])
          and ps.submitted_by_user_id = auth.uid()
        )
      )
  );
$$;
revoke all on function app_private.can_read_preparation_submission(uuid) from public, anon;
grant execute on function app_private.can_read_preparation_submission(uuid) to authenticated;

create policy "scoped staff read preparation submissions"
  on public.preparation_submissions for select to authenticated
  using (app_private.can_read_preparation_submission(id));

create policy "scoped staff read submission items"
  on public.preparation_submission_items for select to authenticated
  using (
    exists (
      select 1 from public.preparation_submissions ps
      where ps.id = preparation_submission_items.preparation_submission_id
    )
  );

create policy "scoped staff read review events"
  on public.preparation_review_events for select to authenticated
  using (
    exists (
      select 1 from public.preparation_submissions ps
      where ps.id = preparation_review_events.preparation_submission_id
    )
  );

-- 7. Submission RPC -------------------------------------------------------
--
-- The preparer (teacher/HOD who prepared the lesson) submits selected
-- preparations / a week / a term for HOD review. The submission groups
-- existing prepared lesson_preparations without rewriting their pedagogical
-- content. Only the preparer may submit their own preparation (consistent
-- with the existing lesson_preparation authority trigger, which validates the
-- preparer on every preparation mutation). Current-school and active
-- governed placement are enforced. Platform Support is excluded.
create or replace function public.submit_preparations(
  p_school_id uuid,
  p_lesson_preparation_ids uuid[],
  p_scope_kind text default 'selected_preparations',
  p_term_label text default null,
  p_week_start date default null,
  p_week_end date default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_school public.schools%rowtype;
  v_tenant uuid;
  v_year integer;
  v_submission_id uuid;
  v_preparation_id uuid;
  v_preparation record;
  v_actor_role text;
  v_staff_member_id uuid;
  v_staff_assignment_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_scope_kind not in ('selected_preparations','week','term') then
    raise exception 'Invalid submission scope kind';
  end if;
  if p_scope_kind = 'week' and (p_week_start is null or p_week_end is null) then
    raise exception 'Week submission requires start and end dates';
  end if;
  if coalesce(array_length(p_lesson_preparation_ids,1),0) = 0 then
    raise exception 'At least one lesson preparation is required';
  end if;

  select * into v_school from public.schools where id = p_school_id;
  if not found then raise exception 'School not found'; end if;
  v_tenant := v_school.tenant_id;
  v_year := extract(year from current_date)::integer;

  -- Current-school and active governed placement are mandatory for the
  -- preparer. Another active non-current school cannot supply authority.
  if not app_private.user_current_school_matches(auth.uid(), p_school_id) then
    raise exception 'Permission denied: submitter is not current-school scoped';
  end if;

  select sm.role_key, sm.staff_member_id, ssa.id
    into v_actor_role, v_staff_member_id, v_staff_assignment_id
  from public.school_memberships sm
  left join public.staff_school_assignments ssa
    on ssa.staff_member_id = sm.staff_member_id
   and ssa.school_id = sm.school_id
   and ssa.effective_from <= current_date
   and (ssa.effective_to is null or ssa.effective_to >= current_date)
  where sm.school_id = p_school_id
    and sm.user_id = auth.uid()
    and sm.role_key in ('teacher','class_teacher','hod')
    and sm.active_from <= current_date
    and (sm.active_to is null or sm.active_to >= current_date)
  order by ssa.effective_from desc nulls last, sm.active_from desc
  limit 1;

  if v_actor_role is null then
    raise exception 'Permission denied: submitter is not an active teacher/HOD at this school';
  end if;

  if v_staff_member_id is not null
     and not app_private.staff_member_has_school_assignment(v_staff_member_id, p_school_id, current_date) then
    raise exception 'Permission denied: submitter has no current governed placement at this school';
  end if;

  insert into public.preparation_submissions(
    tenant_id, school_id, academic_year, submitted_by_user_id, scope_kind, term_label, week_start, week_end, status
  ) values (
    v_tenant, p_school_id, v_year, auth.uid(), p_scope_kind,
    nullif(btrim(coalesce(p_term_label,'')),''), p_week_start, p_week_end, 'submitted'
  ) returning id into v_submission_id;

  foreach v_preparation_id in array p_lesson_preparation_ids
  loop
    select lp.id, lp.status, lp.school_id, lp.tenant_id, lp.prepared_by_user_id
      into v_preparation
    from public.lesson_preparations lp
    where lp.id = v_preparation_id and lp.school_id = p_school_id;

    if not found then
      raise exception 'Lesson preparation % does not belong to the submission school', v_preparation_id;
    end if;

    -- Only the preparer may submit their own preparation. This matches the
    -- existing lesson_preparation authority trigger, which re-validates the
    -- preparer on every preparation mutation.
    if v_preparation.prepared_by_user_id <> auth.uid() then
      raise exception 'Permission denied: only the preparer may submit preparation %', v_preparation_id;
    end if;

    -- A preparation may be submitted from prepared/returned, or resubmitted
    -- from submitted only when its latest submission was returned. This keeps
    -- the return/resubmit flow intact without review touching the preparation.
    if v_preparation.status not in ('prepared','returned','submitted') then
      raise exception 'Lesson preparation % is not in a submittable state', v_preparation_id;
    end if;

    if v_preparation.status = 'submitted' and not exists (
      select 1
      from public.preparation_submission_items psi
      join public.preparation_submissions ps on ps.id = psi.preparation_submission_id
      where psi.lesson_preparation_id = v_preparation.id
        and ps.status = 'returned'
      order by ps.submitted_at desc
      limit 1
    ) then
      raise exception 'Lesson preparation % is already submitted and has not been returned', v_preparation_id;
    end if;

    insert into public.preparation_submission_items(
      tenant_id, school_id, preparation_submission_id, lesson_preparation_id, preparation_status_snapshot
    ) values (v_tenant, p_school_id, v_submission_id, v_preparation.id, v_preparation.status)
    on conflict (preparation_submission_id, lesson_preparation_id) do nothing;

    -- The preparer transitions their own preparation to submitted. The
    -- existing lesson_preparation authority trigger validates the preparer
    -- (prepared_by_user_id = auth.uid()) and current placement.
    update public.lesson_preparations
       set status = 'submitted',
           submitted_at = coalesce(submitted_at, now()),
           updated_at = now()
     where id = v_preparation.id;

    v_count := v_count + 1;
  end loop;

  insert into public.preparation_review_events(
    tenant_id, school_id, preparation_submission_id, event_kind, actor_user_id,
    actor_role_snapshot, actor_staff_member_id, actor_staff_assignment_id, comment, metadata
  ) values (
    v_tenant, p_school_id, v_submission_id, 'submitted', auth.uid(), v_actor_role,
    v_staff_member_id, v_staff_assignment_id,
    case when p_scope_kind = 'week' then 'Week '||p_week_start::text||' to '||p_week_end::text
         when p_scope_kind = 'term' then coalesce(p_term_label,'Term')
         else 'Selected preparations' end,
    jsonb_build_object('scope_kind', p_scope_kind, 'preparation_count', v_count,
      'term_label', p_term_label, 'week_start', p_week_start, 'week_end', p_week_end)
  );

  insert into public.audit_events(tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_tenant, p_school_id, auth.uid(), 'teaching.preparation.submitted', 'preparation_submission', v_submission_id,
    jsonb_build_object('scope_kind', p_scope_kind, 'preparation_count', v_count));

  return v_submission_id;
end;
$$;
revoke all on function public.submit_preparations(uuid,uuid[],text,text,date,date) from public, anon;
grant execute on function public.submit_preparations(uuid,uuid[],text,text,date,date) to authenticated;

comment on function public.submit_preparations(uuid,uuid[],text,text,date,date) is
'Groups selected prepared/returned lesson preparations into a submission for HOD review. Preparations remain teacher-owned; submission is a separate action performed by the preparer. Requires current-school and active governed placement; Platform Support is excluded.';

-- 8. Review / return RPC -------------------------------------------------
--
-- Appends a review event (reviewed or return-for-revision) and updates the
-- submission's current status snapshot. The teacher preparation content is
-- never overwritten: review actions do not touch lesson_preparations, so the
-- preparation and submission remain separate and the full review history is
-- preserved in preparation_review_events. The reviewer's placement is
-- captured at event time so historical review provenance survives later
-- placement changes. Ended/stale HOD placement loses authority via
-- can_review_preparation_submission; Platform Support is excluded.
create or replace function public.review_preparation_submission(
  p_submission_id uuid,
  p_action text,
  p_comment text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_submission public.preparation_submissions%rowtype;
  v_actor_role text;
  v_staff_member_id uuid;
  v_staff_assignment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_action not in ('reviewed','returned') then
    raise exception 'Review action must be reviewed or returned';
  end if;

  select * into v_submission from public.preparation_submissions where id = p_submission_id for update;
  if not found then raise exception 'Preparation submission not found'; end if;

  if not app_private.can_review_preparation_submission(p_submission_id) then
    raise exception 'Permission denied: reviewer is not an authorized HOD/leader for this submission';
  end if;

  if v_submission.status <> 'submitted' then
    raise exception 'Only submitted preparations can be reviewed or returned';
  end if;

  if app_private.has_platform_role(array['platform_admin']) then
    v_actor_role := 'platform_admin';
  else
    select sm.role_key, sm.staff_member_id, ssa.id
      into v_actor_role, v_staff_member_id, v_staff_assignment_id
    from public.school_memberships sm
    left join public.staff_school_assignments ssa
      on ssa.staff_member_id = sm.staff_member_id
       and ssa.school_id = sm.school_id
       and ssa.effective_from <= current_date
       and (ssa.effective_to is null or ssa.effective_to >= current_date)
    where sm.school_id = v_submission.school_id
      and sm.user_id = auth.uid()
      and sm.role_key in ('school_admin','principal','deputy_principal','hod')
      and sm.active_from <= current_date
      and (sm.active_to is null or sm.active_to >= current_date)
    order by ssa.effective_from desc nulls last, sm.active_from desc
    limit 1;
    if v_actor_role is null then
      raise exception 'Permission denied: reviewer is not an authorized HOD/leader for this submission';
    end if;
  end if;

  insert into public.preparation_review_events(
    tenant_id, school_id, preparation_submission_id, event_kind, actor_user_id,
    actor_role_snapshot, actor_staff_member_id, actor_staff_assignment_id, comment
  ) values (
    v_submission.tenant_id, v_submission.school_id, v_submission.id, p_action, auth.uid(),
    v_actor_role, v_staff_member_id, v_staff_assignment_id, nullif(btrim(coalesce(p_comment,'')),'')
  );

  -- Only the submission's oversight state is updated. lesson_preparations
  -- is intentionally untouched so the preparation and submission remain
  -- separate and review history is preserved.
  update public.preparation_submissions set
    status = p_action,
    reviewed_by_user_id = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_comment,'')),''),
    updated_at = now()
  where id = v_submission.id;

  insert into public.audit_events(tenant_id, school_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_submission.tenant_id, v_submission.school_id, auth.uid(),
    case when p_action = 'reviewed' then 'teaching.preparation.reviewed' else 'teaching.preparation.returned' end,
    'preparation_submission', v_submission.id,
    jsonb_build_object('action', p_action, 'reviewer_role', v_actor_role));

  return true;
end;
$$;
revoke all on function public.review_preparation_submission(uuid,text,text) from public, anon;
grant execute on function public.review_preparation_submission(uuid,text,text) to authenticated;

comment on function public.review_preparation_submission(uuid,text,text) is
'HOD/leader review or return-for-revision of a preparation submission. Appends an immutable review event preserving reviewer provenance; never overwrites teacher preparation content. Ended/stale placement loses authority via can_review_preparation_submission; Platform Support excluded.';

-- 9. HOD readiness exceptions RPC ---------------------------------------
--
-- Returns documented readiness exceptions only. No productivity scores or
-- rankings are produced. No Ministry sign-off frequency, deadlines or
-- moderation forms are introduced. 'Overdue' is intentionally not derived
-- here because no school-policy due state exists in the shared model; if a
-- school policy defines a due date in future, overdue can be added without
-- reshaping this contract. Current-school and active placement are enforced
-- so another active non-current school cannot expose teaching plans.
create or replace function public.resolve_hod_teaching_readiness(
  p_school_id uuid,
  p_academic_year integer
) returns table(
  exception_kind text,
  subject_offering_id uuid,
  subject_id uuid,
  register_class_id uuid,
  teacher_allocation_id uuid,
  detail text,
  severity text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_is_platform boolean;
  v_is_leadership boolean;
  v_is_hod boolean;
  v_subject_filter uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_school_id is null or p_academic_year is null then raise exception 'School and academic year are required'; end if;

  v_is_platform := app_private.has_platform_role(array['platform_admin']);
  v_is_leadership := app_private.user_current_school_matches(auth.uid(), p_school_id)
    and app_private.has_school_role(p_school_id, array['school_admin','principal','deputy_principal']);
  v_is_hod := app_private.user_current_school_matches(auth.uid(), p_school_id)
    and app_private.has_school_role(p_school_id, array['hod']);

  if not (v_is_platform or v_is_leadership or v_is_hod) then
    raise exception 'Permission denied: readiness requires current-school HOD/leadership authority';
  end if;

  -- HODs see only their assigned subjects; leadership and platform see all.
  if v_is_hod and not v_is_leadership and not v_is_platform then
    v_subject_filter := array(select app_private.hod_responsible_subjects(p_school_id));
    if v_subject_filter is null or array_length(v_subject_filter,1) is null then
      return; -- no current responsibility => no exceptions to surface
    end if;
  end if;

  -- Unsubmitted preparations: scheduled lessons with a preparation that is
  -- prepared but not yet submitted, or planned lessons past their planned
  -- date with no preparation recorded. School-policy due state is not
  -- invented; 'overdue' is left for a future school-policy configuration.
  return query
  select 'unsubmitted_preparation'::text,
    so.id, so.subject_id, tsi.register_class_id, tsi.teacher_allocation_id,
    coalesce(lp.status,'missing')::text,
    case when lp.id is null then 'high' when lp.status='prepared' then 'medium' else 'low' end
  from public.teaching_schedule_items tsi
  join public.teacher_allocations ta on ta.id = tsi.teacher_allocation_id
  join public.subject_offerings so on so.id = ta.subject_offering_id
  left join public.lesson_preparations lp on lp.teaching_schedule_item_id = tsi.id
    and lp.status in ('draft','prepared')
  where tsi.school_id = p_school_id
    and tsi.academic_year = p_academic_year
    and tsi.status in ('planned','prepared')
    and (v_is_platform or v_is_leadership or so.subject_id = any(v_subject_filter))
    and (lp.id is null or lp.status = 'prepared')
    and (lp.id is not null or tsi.planned_on <= current_date);

  -- Unreviewed submissions: submissions awaiting HOD review.
  return query
  select 'unreviewed_submission'::text,
    so.id, so.subject_id, tsi.register_class_id, tsi.teacher_allocation_id,
    ps.scope_kind || ' submission ' || ps.id::text,
    'medium'::text
  from public.preparation_submissions ps
  join public.preparation_submission_items psi on psi.preparation_submission_id = ps.id
  join public.lesson_preparations lp on lp.id = psi.lesson_preparation_id
  join public.teaching_schedule_items tsi on tsi.id = lp.teaching_schedule_item_id
  join public.teacher_allocations ta on ta.id = tsi.teacher_allocation_id
  join public.subject_offerings so on so.id = ta.subject_offering_id
  where ps.school_id = p_school_id
    and ps.academic_year = p_academic_year
    and ps.status = 'submitted'
    and (v_is_platform or v_is_leadership or so.subject_id = any(v_subject_filter));

  -- Curriculum-capacity risks: pacing plans whose capacity summary records
  -- demand exceeding available capacity. Surfaces the documented capacity
  -- warning without inventing a moderation obligation.
  return query
  select 'curriculum_capacity_risk'::text,
    pp.subject_offering_id, so.subject_id, pp.register_class_id, pp.teacher_allocation_id,
    coalesce(pp.capacity_summary->>'note','Capacity demand exceeds available teaching periods')::text,
    'high'::text
  from public.pacing_plans pp
  join public.subject_offerings so on so.id = pp.subject_offering_id
  where pp.school_id = p_school_id
    and pp.academic_year = p_academic_year
    and pp.status = 'active'
    and (pp.capacity_summary ? 'demand_periods')
    and (pp.capacity_summary ? 'available_periods')
    and (coalesce((pp.capacity_summary->>'demand_periods')::integer,0) > coalesce((pp.capacity_summary->>'available_periods')::integer,0))
    and (v_is_platform or v_is_leadership or so.subject_id = any(v_subject_filter));

  -- Materially behind-plan classes: planned periods scheduled vs actual
  -- periods taught, where the gap is material. Not a teacher score; a class
  -- coverage exception only.
  return query
  with coverage as (
    select tsi.teacher_allocation_id, tsi.register_class_id, so.id as subject_offering_id, so.subject_id,
      coalesce(sum(case when tsi.status in ('planned','prepared','taught') then tsi.planned_period_count else 0 end),0) as planned_periods,
      coalesce(sum(ta2.periods_used),0) as taught_periods
    from public.teaching_schedule_items tsi
    join public.teacher_allocations ta on ta.id = tsi.teacher_allocation_id
    join public.subject_offerings so on so.id = ta.subject_offering_id
    left join public.teaching_actuals ta2 on ta2.teaching_schedule_item_id = tsi.id
    where tsi.school_id = p_school_id and tsi.academic_year = p_academic_year
    group by tsi.teacher_allocation_id, tsi.register_class_id, so.id, so.subject_id
  )
  select 'behind_plan'::text,
    c.subject_offering_id, c.subject_id, c.register_class_id, c.teacher_allocation_id,
    'Planned ' || c.planned_periods::text || ' periods; ' || c.taught_periods::text || ' taught',
    case when c.planned_periods > 0 and (c.taught_periods::float / c.planned_periods) < 0.5 then 'high' else 'medium' end
  from coverage c
  where c.planned_periods > 0
    and c.taught_periods < c.planned_periods
    and (c.planned_periods - c.taught_periods) >= 2
    and (v_is_platform or v_is_leadership or c.subject_id = any(v_subject_filter));

  return;
end;
$$;
revoke all on function public.resolve_hod_teaching_readiness(uuid,integer) from public, anon;
grant execute on function public.resolve_hod_teaching_readiness(uuid,integer) to authenticated;

comment on function public.resolve_hod_teaching_readiness(uuid,integer) is
'HOD/leadership teaching readiness exceptions: unsubmitted preparations, unreviewed submissions, curriculum-capacity risks and materially behind-plan classes. No productivity scores/rankings; no invented Ministry moderation. Bounded to HOD assigned subjects; current-school enforced; Platform Support excluded.';

-- 10. Defense-in-depth scope guards for the new children -----------------
drop trigger if exists subject_department_responsibility_subject_scope_guard on public.subject_department_responsibilities;
create trigger subject_department_responsibility_subject_scope_guard
  before insert or update on public.subject_department_responsibilities
  for each row execute function app_private.enforce_parent_scope('subject_id','public.subjects','school_id','required');

drop trigger if exists subject_department_responsibility_assignment_scope_guard on public.subject_department_responsibilities;
create trigger subject_department_responsibility_assignment_scope_guard
  before insert or update on public.subject_department_responsibilities
  for each row execute function app_private.enforce_parent_scope('department_head_staff_assignment_id','public.staff_school_assignments','school_id','required');

drop trigger if exists preparation_submission_items_submission_scope_guard on public.preparation_submission_items;
create trigger preparation_submission_items_submission_scope_guard
  before insert or update on public.preparation_submission_items
  for each row execute function app_private.enforce_parent_scope('preparation_submission_id','public.preparation_submissions','school_id','required');

drop trigger if exists preparation_review_events_submission_scope_guard on public.preparation_review_events;
create trigger preparation_review_events_submission_scope_guard
  before insert or update on public.preparation_review_events
  for each row execute function app_private.enforce_parent_scope('preparation_submission_id','public.preparation_submissions','school_id','required');

revoke all on public.subject_department_responsibilities from anon;
grant select,insert,update,delete on public.subject_department_responsibilities to authenticated;
revoke all on public.preparation_submissions from anon;
revoke all on public.preparation_submissions from authenticated;
grant select on public.preparation_submissions to authenticated;
revoke all on public.preparation_submission_items from anon;
revoke all on public.preparation_submission_items from authenticated;
grant select on public.preparation_submission_items to authenticated;
revoke all on public.preparation_review_events from anon, authenticated;
grant select on public.preparation_review_events to authenticated;

comment on table public.subject_department_responsibilities is
'Effective-dated HOD department/subject responsibility reusing the authoritative staff_school_assignments placement chain; no parallel department membership.';
comment on table public.preparation_submissions is
'Submission grouping of selected preparations/week/term for HOD review; separate from teacher-owned preparation content.';
comment on table public.preparation_submission_items is
'Join between a preparation submission and the grouped lesson preparations with a status snapshot at link time.';
comment on table public.preparation_review_events is
'Append-only submission/review/return event history preserving reviewer provenance; never overwrites teacher preparation content.';
