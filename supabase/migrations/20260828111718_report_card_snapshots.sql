-- Report cards are generated from approved official results and certified into
-- immutable snapshots. They do not recalculate historical marks from future rules.

create table public.report_card_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  enrolment_id uuid not null references public.enrolments(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  term_number smallint not null check (term_number between 1 and 6),
  template_version text not null,
  snapshot_version integer not null default 1 check (snapshot_version > 0),
  data_snapshot jsonb not null,
  status text not null default 'draft' check (status in ('draft','certified','published','superseded')),
  generated_by_user_id uuid not null references auth.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  certified_by_user_id uuid references auth.users(id) on delete restrict,
  certified_at timestamptz,
  published_at timestamptz,
  supersedes_snapshot_id uuid references public.report_card_snapshots(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(enrolment_id, term_number, snapshot_version),
  check (jsonb_typeof(data_snapshot)='object')
);
create index report_card_snapshots_school_term_idx on public.report_card_snapshots(school_id,academic_year,term_number,status);
create index report_card_snapshots_learner_idx on public.report_card_snapshots(learner_id,academic_year,term_number,snapshot_version desc);
alter table public.report_card_snapshots enable row level security;

create policy "academic staff read report card snapshots" on public.report_card_snapshots
for select to authenticated using (app_private.has_school_role(school_id,array['school_admin','principal','deputy_principal','hod','teacher','class_teacher']) or app_private.has_platform_role(array['platform_admin']));

create or replace function public.build_report_card_snapshot(
  p_enrolment_id uuid,
  p_term_number smallint,
  p_template_version text default 'SCOLAPRO_TERM_REPORT_V1'
)
returns uuid
language plpgsql security definer set search_path=public,app_private as $$
declare
  v_enrol public.enrolments%rowtype;
  v_learner public.learners%rowtype;
  v_class public.register_classes%rowtype;
  v_grade public.grades%rowtype;
  v_term public.academic_terms%rowtype;
  v_results jsonb;
  v_attendance jsonb;
  v_progression jsonb;
  v_version integer;
  v_snapshot_id uuid;
  v_previous uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_term_number<1 or p_term_number>6 then raise exception 'Term number is invalid'; end if;
  if btrim(coalesce(p_template_version,''))='' then raise exception 'Template version is required'; end if;
  select * into v_enrol from public.enrolments where id=p_enrolment_id;
  if not found then raise exception 'Enrolment not found'; end if;
  if not app_private.has_school_role(v_enrol.school_id,array['school_admin','principal','deputy_principal','hod']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  select * into v_learner from public.learners where id=v_enrol.learner_id;
  select * into v_class from public.register_classes where id=v_enrol.register_class_id;
  select * into v_grade from public.grades where id=v_enrol.grade_id;
  select t.* into v_term from public.academic_terms t join public.academic_years y on y.id=t.academic_year_id where t.school_id=v_enrol.school_id and y.year=v_enrol.academic_year and t.term_number=p_term_number;

  select coalesce(jsonb_agg(jsonb_build_object(
    'official_result_id',r.id,'subject_offering_id',r.subject_offering_id,'subject_code',s.subject_code,'subject_name',s.display_name,
    'result_value',r.result_value,'result_status',r.result_status,'symbol',r.symbol,
    'assessment_scheme_key',r.assessment_scheme_key,'assessment_scheme_version',r.assessment_scheme_version,
    'academic_rule_set_key',r.academic_rule_set_key,'academic_rule_set_version',r.academic_rule_set_version,
    'calculation_snapshot',r.calculation_snapshot,'approved_at',r.approved_at
  ) order by s.display_name),'[]'::jsonb) into v_results
  from public.official_results r join public.subject_offerings so on so.id=r.subject_offering_id join public.subjects s on s.id=so.subject_id
  where r.enrolment_id=v_enrol.id and r.term_number=p_term_number;
  if jsonb_array_length(v_results)=0 then raise exception 'No approved official results exist for this learner and term'; end if;

  select jsonb_build_object(
    'recorded_school_days',count(*),
    'present',count(*) filter(where status='present'),
    'absent',count(*) filter(where status='absent'),
    'late',count(*) filter(where status='late'),
    'excused',count(*) filter(where status='excused'),
    'unknown',count(*) filter(where status='unknown')
  ) into v_attendance
  from public.daily_register_current d
  where d.enrolment_id=v_enrol.id
    and (v_term.id is null or ((v_term.starts_on is null or d.attendance_date>=v_term.starts_on) and (v_term.ends_on is null or d.attendance_date<=v_term.ends_on)));

  select case when p_term_number>=3 then jsonb_build_object('outcome',outcome,'rule_set_key',rule_set_key,'rule_set_version',rule_set_version,'status',status,'rationale',rationale) else null end
  into v_progression from public.year_end_progressions where enrolment_id=v_enrol.id;

  select id,snapshot_version into v_previous,v_version from public.report_card_snapshots where enrolment_id=v_enrol.id and term_number=p_term_number order by snapshot_version desc limit 1;
  v_version:=coalesce(v_version,0)+1;
  insert into public.report_card_snapshots(tenant_id,school_id,learner_id,enrolment_id,academic_year,term_number,template_version,snapshot_version,data_snapshot,generated_by_user_id,supersedes_snapshot_id)
  values(v_enrol.tenant_id,v_enrol.school_id,v_enrol.learner_id,v_enrol.id,v_enrol.academic_year,p_term_number,btrim(p_template_version),v_version,
    jsonb_build_object(
      'learner',jsonb_build_object('id',v_learner.id,'first_names',v_learner.first_names,'surname',v_learner.surname,'preferred_name',v_learner.preferred_name,'date_of_birth',v_learner.date_of_birth,'sex',v_learner.sex),
      'enrolment',jsonb_build_object('id',v_enrol.id,'admission_number',v_enrol.admission_number,'academic_year',v_enrol.academic_year,'grade',v_grade.display_name,'register_class',v_class.display_name),
      'term',jsonb_build_object('number',p_term_number,'name',coalesce(v_term.display_name,'Term '||p_term_number),'starts_on',v_term.starts_on,'ends_on',v_term.ends_on),
      'results',v_results,'attendance',coalesce(v_attendance,'{}'::jsonb),'year_end_progression',v_progression
    ),auth.uid(),v_previous) returning id into v_snapshot_id;
  if v_previous is not null then update public.report_card_snapshots set status='superseded' where id=v_previous and status='draft'; end if;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata)
  values(v_enrol.tenant_id,v_enrol.school_id,auth.uid(),'report_card.snapshot.generated','report_card_snapshot',v_snapshot_id,jsonb_build_object('enrolment_id',v_enrol.id,'term_number',p_term_number,'snapshot_version',v_version));
  return v_snapshot_id;
end; $$;

create or replace function public.certify_report_card_snapshot(p_snapshot_id uuid)
returns boolean language plpgsql security definer set search_path=public,app_private as $$
declare v_snapshot public.report_card_snapshots%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_snapshot from public.report_card_snapshots where id=p_snapshot_id for update;
  if not found then raise exception 'Report card snapshot not found'; end if;
  if not app_private.has_school_role(v_snapshot.school_id,array['principal','deputy_principal','school_admin']) and not app_private.has_platform_role(array['platform_admin']) then raise exception 'Permission denied'; end if;
  if v_snapshot.status<>'draft' then raise exception 'Only draft report-card snapshots can be certified'; end if;
  update public.report_card_snapshots set status='certified',certified_by_user_id=auth.uid(),certified_at=now() where id=v_snapshot.id;
  insert into public.audit_events(tenant_id,school_id,actor_user_id,event_type,entity_type,entity_id,metadata) values(v_snapshot.tenant_id,v_snapshot.school_id,auth.uid(),'report_card.snapshot.certified','report_card_snapshot',v_snapshot.id,jsonb_build_object('term_number',v_snapshot.term_number,'snapshot_version',v_snapshot.snapshot_version));
  return true;
end; $$;

revoke all on public.report_card_snapshots from anon;
grant select on public.report_card_snapshots to authenticated;
revoke all on function public.build_report_card_snapshot(uuid,smallint,text) from public,anon; grant execute on function public.build_report_card_snapshot(uuid,smallint,text) to authenticated;
revoke all on function public.certify_report_card_snapshot(uuid) from public,anon; grant execute on function public.certify_report_card_snapshot(uuid) to authenticated;
