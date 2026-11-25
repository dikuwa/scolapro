-- #1306: guardian absence evidence is medical/support sensitive. Storage reads
-- must use the same need-to-know authority as the notice metadata policies.
-- The previous helper widened staff reads to every operational-learner role
-- (hod, teacher, class_teacher, librarian) after the metadata policy had already
-- been narrowed to authorized reviewers, so a librarian or ordinary teacher
-- could enumerate and sign guardian evidence objects. Preserve the guardian
-- branch exactly and delegate the staff branch to the canonical reviewer helper.
create or replace function app_private.can_access_guardian_absence_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, storage, app_private
as $$
  select case
    when array_length(storage.foldername(p_name),1) < 3 then false
    else exists(
      select 1
      from public.guardian_absence_notices n
      where n.id::text = (storage.foldername(p_name))[3]
        and n.school_id::text = (storage.foldername(p_name))[1]
        and (
          exists (
            select 1
            from public.guardian_user_links gul
            join public.learner_guardians lg
              on lg.tenant_id = gul.tenant_id
             and lg.guardian_id = gul.guardian_id
            where gul.tenant_id = n.tenant_id
              and gul.guardian_id = n.guardian_id
              and gul.user_id = (select auth.uid())
              and lg.learner_id = n.learner_id
              and lg.effective_from <= current_date
              and (lg.effective_to is null or lg.effective_to >= current_date)
              and exists (
                select 1
                from public.enrolments e
                where e.id = n.enrolment_id
                  and e.tenant_id = n.tenant_id
                  and e.school_id = n.school_id
                  and e.learner_id = n.learner_id
                  and e.status = 'current'
                  and e.enrolled_from <= current_date
                  and (e.enrolled_to is null or e.enrolled_to >= current_date)
              )
          )
          or app_private.can_review_guardian_absence_notice(n.id)
        )
    )
  end;
$$;

revoke all on function app_private.can_access_guardian_absence_object(text)
from public, anon, authenticated;

comment on function app_private.can_access_guardian_absence_object(text) is
'Private guardian-absence object authorization. Guardians require a current effective learner relationship and current notice enrolment; staff reads require the same need-to-know reviewer authority as the notice metadata policy. Generic operational-learner visibility is insufficient.';
