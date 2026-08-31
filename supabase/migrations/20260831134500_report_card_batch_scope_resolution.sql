-- Resolve whole-school, grade and register-class report-card batches inside PostgreSQL.
-- Custom selections continue to use create_report_card_batch(...) with explicit enrolment IDs.
-- This keeps the durable queue as the single source of batch semantics while removing the
-- need to submit thousands of hidden enrolment UUIDs for ordinary managed scopes.

create or replace function public.create_report_card_batch_for_scope(
  p_school_id uuid,
  p_academic_year integer,
  p_term_number integer,
  p_scope_type text,
  p_scope_id uuid,
  p_operation text
)
returns uuid
language plpgsql
security definer
set search_path=public,app_private
as $$
declare
  v_scope_label text;
  v_enrolment_ids uuid[];
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    app_private.has_school_role(p_school_id,array['school_admin','principal','deputy_principal'])
    or app_private.has_platform_role(array['platform_admin'])
  ) then
    raise exception 'Permission denied';
  end if;

  if p_term_number<1 or p_term_number>6 then
    raise exception 'Term number is invalid';
  end if;
  if p_academic_year<2000 or p_academic_year>2200 then
    raise exception 'Academic year is invalid';
  end if;
  if p_operation not in ('generate','certify','publish','pdf') then
    raise exception 'Unsupported report-card batch operation';
  end if;
  if p_scope_type not in ('school','grade','class') then
    raise exception 'Server-resolved batches support school, grade or class scope only';
  end if;

  if p_scope_type='school' then
    if p_scope_id is not null then
      raise exception 'Whole-school scope does not accept a scope identifier';
    end if;

    if not exists(
      select 1
      from public.schools s
      where s.id=p_school_id
        and s.status='active'
    ) then
      raise exception 'School not found or inactive';
    end if;

    v_scope_label:='Whole school';
  elsif p_scope_type='grade' then
    if p_scope_id is null then
      raise exception 'Grade scope requires a grade identifier';
    end if;

    select g.display_name
    into v_scope_label
    from public.grades g
    where g.id=p_scope_id
      and g.school_id=p_school_id
      and g.academic_year=p_academic_year;

    if v_scope_label is null then
      raise exception 'Grade not found in this school and academic year';
    end if;
  else
    if p_scope_id is null then
      raise exception 'Class scope requires a register-class identifier';
    end if;

    select rc.display_name
    into v_scope_label
    from public.register_classes rc
    where rc.id=p_scope_id
      and rc.school_id=p_school_id
      and rc.academic_year=p_academic_year;

    if v_scope_label is null then
      raise exception 'Register class not found in this school and academic year';
    end if;
  end if;

  select count(*)::integer
  into v_total
  from public.enrolments e
  where e.school_id=p_school_id
    and e.academic_year=p_academic_year
    and e.status='current'
    and (p_scope_type<>'grade' or e.grade_id=p_scope_id)
    and (p_scope_type<>'class' or e.register_class_id=p_scope_id);

  if v_total=0 then
    raise exception 'No current enrolments were found for this report-card scope';
  end if;
  if v_total>5000 then
    raise exception 'A report-card batch cannot exceed 5000 learners';
  end if;

  select array_agg(e.id order by e.id)
  into v_enrolment_ids
  from public.enrolments e
  where e.school_id=p_school_id
    and e.academic_year=p_academic_year
    and e.status='current'
    and (p_scope_type<>'grade' or e.grade_id=p_scope_id)
    and (p_scope_type<>'class' or e.register_class_id=p_scope_id);

  return public.create_report_card_batch(
    p_school_id,
    p_academic_year,
    p_term_number,
    p_scope_type,
    v_scope_label,
    p_operation,
    v_enrolment_ids
  );
end;
$$;

revoke all on function public.create_report_card_batch_for_scope(uuid,integer,integer,text,uuid,text) from public,anon;
grant execute on function public.create_report_card_batch_for_scope(uuid,integer,integer,text,uuid,text) to authenticated;

comment on function public.create_report_card_batch_for_scope(uuid,integer,integer,text,uuid,text) is
'Governed report-card batch entry point for whole-school, grade and register-class scopes. Resolves current enrolments server-side, derives the scope label from canonical school data and delegates durable queue creation to create_report_card_batch(...).';
