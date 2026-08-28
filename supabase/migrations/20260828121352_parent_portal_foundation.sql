-- Parent portal read model. Parent identities are established by guardian claims;
-- linked learners are resolved server-side so school-wide learner access is never granted.

create or replace function public.find_claimable_guardian_profiles()
returns table(guardian_id uuid, tenant_id uuid, display_name text)
language sql
stable
security definer
set search_path=public,auth
as $$
  select distinct gp.id,gp.tenant_id,btrim(gp.first_names||' '||gp.surname) as display_name
  from auth.users u
  join public.guardian_contacts gc on gc.contact_type='email'
    and gc.effective_to is null
    and lower(btrim(gc.contact_value))=lower(u.email)
  join public.guardian_profiles gp on gp.id=gc.guardian_id and gp.status='active'
  where u.id=auth.uid()
    and not exists(select 1 from public.guardian_user_links gul where gul.user_id=u.id and gul.guardian_id=gp.id)
  order by 3;
$$;

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
      select e1.* from public.enrolments e1 where e1.learner_id=ll.learner_id
      order by (e1.status='current') desc,e1.enrolled_from desc limit 1
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
      'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'term_number',r.term_number,'snapshot_version',r.snapshot_version,'published_at',r.published_at) order by r.term_number,r.snapshot_version desc) from public.report_card_snapshots r where r.learner_id=cd.learner_id and r.status='published'),'[]'::jsonb)
    ) order by cd.surname,cd.first_names),'[]'::jsonb)
  ) from current_data cd;
$$;

revoke all on function public.find_claimable_guardian_profiles() from public,anon;
grant execute on function public.find_claimable_guardian_profiles() to authenticated;
revoke all on function public.get_parent_family_overview() from public,anon;
grant execute on function public.get_parent_family_overview() to authenticated;

comment on function public.find_claimable_guardian_profiles() is 'Returns only guardian profiles whose active email exactly matches the authenticated account and are not already linked.';
comment on function public.get_parent_family_overview() is 'Returns child and published-report summary only through guardian identities linked to the authenticated account.';
