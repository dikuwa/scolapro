-- Parent-facing "current" read models must use enrolment effective periods, not only
-- the workflow status label. A learner may legitimately have one current enrolment per
-- academic year, including a future-start next-year admission, so status='current'
-- alone can expose the next placement before it begins.

create or replace function public.get_parent_family_overview()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  with linked_learners as (
    select distinct lg.learner_id
    from public.guardian_user_links gul
    join public.learner_guardians lg on lg.guardian_id=gul.guardian_id
    where gul.user_id=auth.uid()
      and lg.effective_from<=current_date
      and (lg.effective_to is null or lg.effective_to>=current_date)
  ), current_data as (
    select ll.learner_id,l.first_names,l.surname,l.preferred_name,
      e.id enrolment_id,e.admission_number,e.academic_year,e.status enrolment_status,
      s.id school_id,s.name school_name,g.display_name grade_name,rc.display_name class_name
    from linked_learners ll
    join public.learners l on l.id=ll.learner_id
    left join lateral (
      select e1.*
      from public.enrolments e1
      where e1.learner_id=ll.learner_id
        and e1.status='current'
        and e1.enrolled_from<=current_date
        and (e1.enrolled_to is null or e1.enrolled_to>=current_date)
      order by e1.enrolled_from desc,e1.created_at desc
      limit 1
    ) e on true
    left join public.schools s on s.id=e.school_id
    left join public.grades g on g.id=e.grade_id
    left join public.register_classes rc on rc.id=e.register_class_id
  )
  select jsonb_build_object(
    'children',coalesce(jsonb_agg(jsonb_build_object(
      'learner_id',cd.learner_id,
      'name',btrim(cd.first_names||' '||cd.surname),
      'preferred_name',cd.preferred_name,
      'enrolment_id',cd.enrolment_id,
      'admission_number',cd.admission_number,
      'academic_year',cd.academic_year,
      'school_id',cd.school_id,
      'school_name',cd.school_name,
      'grade',cd.grade_name,
      'register_class',cd.class_name,
      'reports',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.id,
          'term_number',r.term_number,
          'snapshot_version',r.snapshot_version,
          'published_at',r.published_at
        ) order by r.term_number,r.snapshot_version desc)
        from public.report_card_snapshots r
        where r.learner_id=cd.learner_id and r.status='published'
      ),'[]'::jsonb)
    ) order by cd.surname,cd.first_names),'[]'::jsonb)
  )
  from current_data cd;
$$;

revoke all on function public.get_parent_family_overview() from public,anon;
grant execute on function public.get_parent_family_overview() to authenticated,service_role;

create or replace function public.get_my_children_voluntary_contributions()
returns table(
  learner_id uuid,
  campaign_id uuid,
  campaign_title text,
  campaign_description text,
  item_id uuid,
  item_type text,
  item_label text,
  unit_label text,
  suggested_quantity numeric,
  suggested_amount numeric,
  contribution_id uuid,
  contribution_date date,
  contributed_quantity numeric,
  contributed_amount numeric,
  contribution_note text,
  contribution_status text
)
language sql
stable
security definer
set search_path=public,app_private
as $$
  select lg.learner_id,c.id,c.title,c.description,i.id,i.item_type,i.label,i.unit_label,
         i.suggested_quantity,i.suggested_amount,r.id,r.contribution_date,r.quantity,r.amount,r.note,r.status
  from public.guardian_user_links gul
  join public.learner_guardians lg on lg.guardian_id=gul.guardian_id
    and lg.effective_from<=current_date
    and (lg.effective_to is null or lg.effective_to>=current_date)
  join public.enrolments e on e.learner_id=lg.learner_id
    and e.status='current'
    and e.enrolled_from<=current_date
    and (e.enrolled_to is null or e.enrolled_to>=current_date)
  join public.voluntary_contribution_campaigns c on c.school_id=e.school_id
    and c.academic_year=e.academic_year
    and c.status='published'
    and c.visible_to_guardians=true
    and c.starts_on<=current_date
    and (c.ends_on is null or c.ends_on>=current_date)
  join public.voluntary_contribution_items i on i.campaign_id=c.id and i.active=true
  left join public.learner_voluntary_contributions r on r.learner_id=lg.learner_id
    and r.item_id=i.id
    and r.status<>'reversed'
  where gul.user_id=auth.uid()
  order by lg.learner_id,c.starts_on desc,i.sort_order,r.contribution_date desc;
$$;

revoke all on function public.get_my_children_voluntary_contributions() from public,anon;
grant execute on function public.get_my_children_voluntary_contributions() to authenticated,service_role;

comment on function public.get_parent_family_overview() is
'Parent family overview: current school/class fields use an enrolment whose effective period covers today; future admissions do not replace the present placement.';
comment on function public.get_my_children_voluntary_contributions() is
'Guardian contribution campaigns are returned only through learner enrolments whose effective period covers today.';
