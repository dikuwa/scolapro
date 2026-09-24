create or replace function app_private.build_learner_subject_bulk_preview(
  p_school_id uuid,
  p_academic_year integer,
  p_scope_type text,
  p_scope_id uuid,
  p_subject_offering_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_tenant_id uuid;
  v_scope_type text:=btrim(coalesce(p_scope_type,''));
  v_scope_label text;
  v_grade_id uuid;
  v_grade_label text;
  v_enrolment_ids uuid[]:='{}'::uuid[];
  v_desired uuid[]:='{}'::uuid[];
  v_invalid_scope_count integer:=0;
  v_conflicts jsonb:='[]'::jsonb;
  v_additions integer:=0;
  v_reactivations integer:=0;
  v_unchanged integer:=0;
  v_withdrawals integer:=0;
  v_affected_subjects integer:=0;
  v_state text;
  v_fingerprint text;
begin
  if p_subject_offering_ids is null then
    raise exception 'Subject offering selection is required; use an empty array to clear all choices';
  end if;
  if v_scope_type not in ('grade','register_class','field_group') then
    raise exception 'Unsupported learner subject assignment scope';
  end if;

  select s.tenant_id into v_tenant_id from public.schools s where s.id=p_school_id;
  if v_tenant_id is null then raise exception 'School scope not found'; end if;

  if v_scope_type='grade' then
    select g.id,g.display_name into v_grade_id,v_scope_label
    from public.grades g
    where g.id=p_scope_id and g.school_id=p_school_id and g.academic_year=p_academic_year;
  elsif v_scope_type='register_class' then
    select rc.grade_id,rc.display_name into v_grade_id,v_scope_label
    from public.register_classes rc
    where rc.id=p_scope_id and rc.school_id=p_school_id and rc.academic_year=p_academic_year;
  else
    select so.grade_id,concat(coalesce(s.display_name,'Subject'),' · ',coalesce(g.display_name,'Grade'))
    into v_grade_id,v_scope_label
    from public.subject_offerings so
    join public.subjects s on s.id=so.subject_id
    join public.grades g on g.id=so.grade_id
    where so.id=p_scope_id and so.school_id=p_school_id and so.academic_year=p_academic_year;
  end if;
  if v_grade_id is null then raise exception 'Assignment scope is outside the current school and academic year'; end if;
  select g.display_name into v_grade_label from public.grades g where g.id=v_grade_id;

  if v_scope_type='grade' then
    select coalesce(array_agg(e.id order by e.id),'{}'::uuid[]) into v_enrolment_ids
    from public.enrolments e
    where e.school_id=p_school_id and e.academic_year=p_academic_year
      and e.grade_id=v_grade_id and e.status='current';
  elsif v_scope_type='register_class' then
    select coalesce(array_agg(e.id order by e.id),'{}'::uuid[]) into v_enrolment_ids
    from public.enrolments e
    where e.school_id=p_school_id and e.academic_year=p_academic_year
      and e.register_class_id=p_scope_id and e.grade_id=v_grade_id and e.status='current';
  else
    select coalesce(array_agg(e.id order by e.id),'{}'::uuid[]) into v_enrolment_ids
    from public.enrolments e
    join public.learner_subject_registrations r
      on r.enrolment_id=e.id and r.subject_offering_id=p_scope_id and r.status='active'
    where e.school_id=p_school_id and e.academic_year=p_academic_year
      and e.grade_id=v_grade_id and e.status='current';
  end if;

  if cardinality(v_enrolment_ids)>500 then
    raise exception 'Assignment scope exceeds the 500 learner safety limit';
  end if;

  select coalesce(array_agg(x.id order by x.id),'{}'::uuid[]) into v_desired
  from (select distinct u.id from unnest(p_subject_offering_ids) u(id) where u.id is not null) x;
  if cardinality(v_desired)>50 then raise exception 'Subject selection exceeds the 50 subject safety limit'; end if;

  select count(*) into v_invalid_scope_count
  from unnest(v_desired) d(id)
  left join public.subject_offerings so on so.id=d.id
  where so.id is null or so.school_id<>p_school_id or so.tenant_id<>v_tenant_id or so.academic_year<>p_academic_year;
  if v_invalid_scope_count>0 then
    raise exception 'One or more selected subjects are outside the current school and academic year';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'subject_offering_id',so.id,
      'code',case when so.grade_id<>v_grade_id then 'wrong_grade' else 'inactive_offering' end,
      'message',case when so.grade_id<>v_grade_id then 'Subject is configured for a different grade.' else 'Subject offering is not active.' end
    ) order by s.display_name),'[]'::jsonb)
  into v_conflicts
  from public.subject_offerings so
  join public.subjects s on s.id=so.subject_id
  where so.id=any(v_desired) and (so.grade_id<>v_grade_id or so.status<>'active');

  with valid_desired as (
    select so.id from public.subject_offerings so
    where so.id=any(v_desired) and so.grade_id=v_grade_id and so.status='active'
  ), desired_state as (
    select e.id enrolment_id,vd.id offering_id,r.status
    from unnest(v_enrolment_ids) e(id) cross join valid_desired vd
    left join public.learner_subject_registrations r
      on r.enrolment_id=e.id and r.subject_offering_id=vd.id
  )
  select
    count(*) filter(where status is null),
    count(*) filter(where status='withdrawn'),
    count(*) filter(where status='active')
  into v_additions,v_reactivations,v_unchanged
  from desired_state;

  select count(*) into v_withdrawals
  from public.learner_subject_registrations r
  where r.enrolment_id=any(v_enrolment_ids) and r.status='active'
    and not (r.subject_offering_id=any(v_desired));

  select count(distinct x.id) into v_affected_subjects
  from (
    select unnest(v_desired) id
    union
    select r.subject_offering_id from public.learner_subject_registrations r
    where r.enrolment_id=any(v_enrolment_ids) and r.status='active'
  ) x;

  select concat_ws('|',
    p_school_id::text,p_academic_year::text,v_scope_type,p_scope_id::text,
    array_to_string(v_enrolment_ids,','),array_to_string(v_desired,','),
    coalesce(string_agg(concat(r.enrolment_id,':',r.subject_offering_id,':',r.status),',' order by r.enrolment_id,r.subject_offering_id),'')
  ) into v_state
  from public.learner_subject_registrations r
  where r.enrolment_id=any(v_enrolment_ids);
  v_fingerprint:=md5(v_state);

  return jsonb_build_object(
    'scope',jsonb_build_object('type',v_scope_type,'id',p_scope_id,'label',v_scope_label,'grade_id',v_grade_id,'grade_label',v_grade_label),
    'subject_offering_ids',to_jsonb(v_desired),
    'enrolment_ids',to_jsonb(v_enrolment_ids),
    'affected_learner_count',cardinality(v_enrolment_ids),
    'affected_subject_count',v_affected_subjects,
    'addition_count',v_additions,
    'reactivation_count',v_reactivations,
    'unchanged_count',v_unchanged,
    'withdrawal_count',v_withdrawals,
    'conflict_count',jsonb_array_length(v_conflicts),
    'conflicts',v_conflicts,
    'preview_fingerprint',v_fingerprint
  );
end;
$$;

revoke all on function app_private.build_learner_subject_bulk_preview(uuid,integer,text,uuid,uuid[]) from public,anon,authenticated;

create or replace function public.preview_learner_subject_bulk_assignment(
  p_school_id uuid,
  p_academic_year integer,
  p_scope_type text,
  p_scope_id uuid,
  p_subject_offering_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_learner_subject_registrations(p_school_id) then raise exception 'Permission denied'; end if;
  return app_private.build_learner_subject_bulk_preview(p_school_id,p_academic_year,p_scope_type,p_scope_id,p_subject_offering_ids);
end;
$$;

revoke all on function public.preview_learner_subject_bulk_assignment(uuid,integer,text,uuid,uuid[]) from public,anon;
grant execute on function public.preview_learner_subject_bulk_assignment(uuid,integer,text,uuid,uuid[]) to authenticated;

create or replace function public.apply_learner_subject_bulk_assignment(
  p_school_id uuid,
  p_academic_year integer,
  p_scope_type text,
  p_scope_id uuid,
  p_subject_offering_ids uuid[],
  p_preview_fingerprint text,
  p_reason text default 'Bulk subject assignment'
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app_private
as $$
declare
  v_preview jsonb;
  v_enrolment_id uuid;
  v_result jsonb;
  v_registered integer:=0;
  v_reactivated integer:=0;
  v_unchanged integer:=0;
  v_withdrawn integer:=0;
  v_changed integer:=0;
  v_tenant_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.can_manage_learner_subject_registrations(p_school_id) then raise exception 'Permission denied'; end if;
  if nullif(btrim(coalesce(p_preview_fingerprint,'')),'') is null then raise exception 'A current preview is required before apply'; end if;

  v_preview:=app_private.build_learner_subject_bulk_preview(p_school_id,p_academic_year,p_scope_type,p_scope_id,p_subject_offering_ids);
  perform 1 from public.enrolments e
  where e.id in (select value::text::uuid from jsonb_array_elements_text(v_preview->'enrolment_ids'))
  order by e.id for update;
  perform 1 from public.learner_subject_registrations r
  where r.enrolment_id in (select value::text::uuid from jsonb_array_elements_text(v_preview->'enrolment_ids'))
  order by r.enrolment_id,r.subject_offering_id for update;
  v_preview:=app_private.build_learner_subject_bulk_preview(p_school_id,p_academic_year,p_scope_type,p_scope_id,p_subject_offering_ids);

  if v_preview->>'preview_fingerprint'<>p_preview_fingerprint then
    raise exception 'Assignment scope changed after preview; review the updated preview before applying';
  end if;
  if (v_preview->>'conflict_count')::integer>0 then
    raise exception 'Resolve subject selection conflicts before applying';
  end if;

  for v_enrolment_id in select value::text::uuid from jsonb_array_elements_text(v_preview->'enrolment_ids') loop
    v_result:=public.sync_learner_subject_registrations(
      v_enrolment_id,p_subject_offering_ids,'bulk_assignment',nullif(btrim(coalesce(p_reason,'')),'')
    );
    v_registered:=v_registered+coalesce((v_result->>'registered_count')::integer,0);
    v_reactivated:=v_reactivated+coalesce((v_result->>'reactivated_count')::integer,0);
    v_unchanged:=v_unchanged+coalesce((v_result->>'unchanged_count')::integer,0);
    v_withdrawn:=v_withdrawn+coalesce((v_result->>'withdrawn_count')::integer,0);
  end loop;
  v_changed:=v_registered+v_reactivated+v_withdrawn;
  select s.tenant_id into v_tenant_id from public.schools s where s.id=p_school_id;
  if v_changed>0 then
    insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
    values(v_tenant_id,p_school_id,auth.uid(),'learner_subject_registration.bulk_applied','school',p_school_id,
      jsonb_build_object('academic_year',p_academic_year,'scope_type',p_scope_type,'scope_id',p_scope_id,
        'affected_learner_count',(v_preview->>'affected_learner_count')::integer,
        'subject_offering_ids',v_preview->'subject_offering_ids','registered_count',v_registered,
        'reactivated_count',v_reactivated,'unchanged_count',v_unchanged,'withdrawn_count',v_withdrawn,
        'preview_fingerprint',p_preview_fingerprint));
  end if;

  return v_preview || jsonb_build_object('registered_count',v_registered,'reactivated_count',v_reactivated,
    'unchanged_count',v_unchanged,'withdrawn_count',v_withdrawn,'changed_count',v_changed,'applied',true);
end;
$$;

revoke all on function public.apply_learner_subject_bulk_assignment(uuid,integer,text,uuid,uuid[],text,text) from public,anon;
grant execute on function public.apply_learner_subject_bulk_assignment(uuid,integer,text,uuid,uuid[],text,text) to authenticated;

comment on function public.preview_learner_subject_bulk_assignment(uuid,integer,text,uuid,uuid[]) is
  'Returns a bounded, school-authorized, read-only preview for grade, register-class, or existing subject-registration-group bulk assignment without mutating registrations.';
comment on function public.apply_learner_subject_bulk_assignment(uuid,integer,text,uuid,uuid[],text,text) is
  'Applies only an unchanged preview through the canonical audited learner subject synchronization lifecycle in one server transaction.';
