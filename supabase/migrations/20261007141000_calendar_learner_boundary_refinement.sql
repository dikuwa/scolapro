-- Issue #1159: make learner term boundaries the operational calendar authority.
-- Teacher dates remain administrative metadata. This RPC updates the learner
-- term boundaries and their official source/profile atomically so attendance,
-- timetable and planning consumers cannot observe half-applied calendar edits.

create or replace function public.configure_operational_term_calendar(
  p_academic_term_id uuid,
  p_learner_starts_on date,
  p_learner_ends_on date,
  p_teacher_starts_on date default null,
  p_teacher_ends_on date default null,
  p_official_learner_day_count integer default null,
  p_source_kind text default 'manual',
  p_source_label text default null,
  p_source_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_term public.academic_terms%rowtype;
  v_year public.academic_years%rowtype;
  v_profile_id uuid;
  v_year_starts_on date;
  v_year_ends_on date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_term
  from public.academic_terms
  where id=p_academic_term_id
  for update;
  if not found then raise exception 'Academic term not found'; end if;

  select * into v_year
  from public.academic_years
  where id=v_term.academic_year_id
  for update;
  if not found then raise exception 'Academic year not found'; end if;

  if not app_private.user_targets_current_school(auth.uid(),v_term.school_id)
     or not app_private.has_school_role(v_term.school_id,array['school_admin','principal','deputy_principal']) then
    raise exception 'Permission denied';
  end if;
  if v_year.status='closed' then raise exception 'Closed academic year is final'; end if;
  if v_term.status='closed' then raise exception 'Closed academic term is final'; end if;

  if p_learner_starts_on is null or p_learner_ends_on is null then
    raise exception 'Learner opening and closing dates are required';
  end if;
  if p_learner_ends_on<p_learner_starts_on then
    raise exception 'Learner closing date cannot precede learner opening date';
  end if;
  if exists (
    select 1
    from public.academic_terms other_term
    where other_term.academic_year_id=v_term.academic_year_id
      and other_term.id<>v_term.id
      and other_term.starts_on is not null
      and other_term.ends_on is not null
      and daterange(other_term.starts_on,other_term.ends_on,'[]')
          && daterange(p_learner_starts_on,p_learner_ends_on,'[]')
  ) then
    raise exception 'Learner term dates cannot overlap another term';
  end if;

  if (p_teacher_starts_on is null)<>(p_teacher_ends_on is null) then
    raise exception 'Provide both teacher opening and closing dates or leave both blank';
  end if;
  if p_teacher_starts_on is not null and p_teacher_ends_on<p_teacher_starts_on then
    raise exception 'Teacher closing date cannot precede teacher opening date';
  end if;
  if p_official_learner_day_count is not null
     and (p_official_learner_day_count<0 or p_official_learner_day_count>366) then
    raise exception 'Official learner day count is invalid';
  end if;
  if p_source_kind not in ('official_source','manual','structured_import','ocr_review','recovery') then
    raise exception 'Calendar profile source is invalid';
  end if;

  update public.academic_terms
  set starts_on=p_learner_starts_on,
      ends_on=p_learner_ends_on,
      updated_at=now()
  where id=v_term.id;

  select min(term.starts_on),max(term.ends_on)
  into v_year_starts_on,v_year_ends_on
  from public.academic_terms term
  where term.academic_year_id=v_term.academic_year_id
    and term.starts_on is not null
    and term.ends_on is not null;

  update public.academic_years
  set starts_on=v_year_starts_on,
      ends_on=v_year_ends_on,
      updated_at=now()
  where id=v_year.id;

  insert into public.academic_term_calendar_profiles(
    tenant_id,school_id,academic_term_id,teacher_starts_on,teacher_ends_on,
    official_learner_day_count,source_kind,source_label,source_reference,configured_by_user_id
  ) values(
    v_term.tenant_id,v_term.school_id,v_term.id,p_teacher_starts_on,p_teacher_ends_on,
    p_official_learner_day_count,p_source_kind,
    nullif(btrim(coalesce(p_source_label,'')),''),
    nullif(btrim(coalesce(p_source_reference,'')),''),
    auth.uid()
  )
  on conflict(academic_term_id) do update set
    teacher_starts_on=excluded.teacher_starts_on,
    teacher_ends_on=excluded.teacher_ends_on,
    official_learner_day_count=excluded.official_learner_day_count,
    source_kind=excluded.source_kind,
    source_label=excluded.source_label,
    source_reference=excluded.source_reference,
    configured_by_user_id=auth.uid(),
    updated_at=now()
  returning id into v_profile_id;

  insert into public.audit_events(
    tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata
  ) values(
    v_term.tenant_id,v_term.school_id,auth.uid(),'calendar.term_boundaries.configured',
    'academic_term_calendar_profile',v_profile_id,
    jsonb_build_object(
      'academic_term_id',v_term.id,
      'term_number',v_term.term_number,
      'learner_starts_on',p_learner_starts_on,
      'learner_ends_on',p_learner_ends_on,
      'teacher_starts_on',p_teacher_starts_on,
      'teacher_ends_on',p_teacher_ends_on,
      'official_learner_day_count',p_official_learner_day_count,
      'source_kind',p_source_kind,
      'source_label',nullif(btrim(coalesce(p_source_label,'')),''),
      'source_reference',nullif(btrim(coalesce(p_source_reference,'')),'')
    )
  );

  return v_profile_id;
end;
$$;

revoke all on function public.configure_operational_term_calendar(uuid,date,date,date,date,integer,text,text,text) from public,anon;
grant execute on function public.configure_operational_term_calendar(uuid,date,date,date,date,integer,text,text,text) to authenticated;

comment on function public.configure_operational_term_calendar(uuid,date,date,date,date,integer,text,text,text) is
'Atomically configures learner term boundaries (operational) plus teacher dates and published-day/source metadata (administrative/provenance).';
