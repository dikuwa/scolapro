begin;

select plan(12);

select has_function(
  'app_private','enforce_learner_history_provenance_integrity',array[]::text[],
  'learner history provenance helper exists'
);

select trigger_is(
  'public','conduct_events','conduct_event_provenance_integrity_trg',
  'app_private','enforce_learner_history_provenance_integrity',
  'conduct provenance trigger installed'
);

select trigger_is(
  'public','achievement_events','achievement_event_provenance_integrity_trg',
  'app_private','enforce_learner_history_provenance_integrity',
  'achievement provenance trigger installed'
);

select trigger_is(
  'public','learner_support_cases','learner_support_case_provenance_integrity_trg',
  'app_private','enforce_learner_history_provenance_integrity',
  'learner support provenance trigger installed'
);

select is(
  has_function_privilege('anon','app_private.enforce_learner_history_provenance_integrity()','EXECUTE'),
  false,
  'anon cannot execute learner history provenance helper'
);

select is(
  has_function_privilege('authenticated','app_private.enforce_learner_history_provenance_integrity()','EXECUTE'),
  false,
  'authenticated cannot execute learner history provenance helper'
);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fb000000-0000-4000-8000-000000000001','history-provenance@example.test','authenticated','authenticated',now(),now());

-- The provenance suite is about immutable history roots. Give its fixture author
-- real current school authority so the physical recorder guard does not mask the
-- update-provenance assertions below.
insert into public.school_memberships(
  tenant_id,school_id,user_id,role_key,active_from,active_to
) values(
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'fb000000-0000-4000-8000-000000000001','principal',current_date-10,null
);

insert into public.conduct_events(
  id,tenant_id,school_id,learner_id,enrolment_id,occurred_on,direction,category_code,severity,summary,status,recorded_by_user_id
) values(
  'fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'negative','TEST','routine','History provenance test','recorded','fb000000-0000-4000-8000-000000000001'
);

insert into public.achievement_events(
  id,tenant_id,school_id,learner_id,enrolment_id,achieved_on,category_code,title,recorded_by_user_id
) values(
  'fb200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'TEST','History provenance achievement','fb000000-0000-4000-8000-000000000001'
);

insert into public.learner_support_cases(
  id,tenant_id,school_id,learner_id,enrolment_id,opened_on,case_type,sensitivity,summary,status,opened_by_user_id
) values(
  'fb300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',current_date,'wellbeing','restricted','History provenance support case','open','fb000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$update public.conduct_events
      set learner_id='50000000-0000-4000-8000-000000000002',
          enrolment_id='60000000-0000-4000-8000-000000000002'
    where id='fb100000-0000-4000-8000-000000000001'$$,
  'Learner history scope and creation provenance are immutable',
  'conduct history cannot be rebound to another valid learner and enrolment'
);

select throws_ok(
  $$update public.achievement_events
      set learner_id='50000000-0000-4000-8000-000000000002',
          enrolment_id='60000000-0000-4000-8000-000000000002'
    where id='fb200000-0000-4000-8000-000000000001'$$,
  'Learner history scope and creation provenance are immutable',
  'achievement history cannot be rebound to another valid learner and enrolment'
);

select throws_ok(
  $$update public.learner_support_cases
      set learner_id='50000000-0000-4000-8000-000000000002',
          enrolment_id='60000000-0000-4000-8000-000000000002'
    where id='fb300000-0000-4000-8000-000000000001'$$,
  'Learner history scope and creation provenance are immutable',
  'learner support case cannot be rebound to another valid learner and enrolment'
);

select lives_ok(
  $$update public.conduct_events
      set status='under_review', details='Reviewed without rewriting identity'
    where id='fb100000-0000-4000-8000-000000000001'$$,
  'conduct workflow fields remain editable'
);

select lives_ok(
  $$update public.achievement_events
      set description='Corrected achievement narrative'
    where id='fb200000-0000-4000-8000-000000000001'$$,
  'achievement narrative remains editable'
);

select lives_ok(
  $$update public.learner_support_cases
      set status='monitoring', summary='Updated support summary'
    where id='fb300000-0000-4000-8000-000000000001'$$,
  'learner support workflow fields remain editable'
);

select * from finish();
rollback;
