\set ON_ERROR_STOP on
CREATE TABLE public.issue_1329_guardian_absence_results (
  runner text primary key,
  outcome text not null
);
GRANT INSERT ON public.issue_1329_guardian_absence_results TO authenticated;

INSERT INTO auth.users(id,email,email_confirmed_at,aud,role,created_at,updated_at)
VALUES ('73000000-0000-4000-8000-000000001329','qa1329-guardian@example.test',now(),'authenticated','authenticated',now(),now());

INSERT INTO public.schools(id,tenant_id,name,emis_number,status)
VALUES ('73000000-0000-4000-8000-000000001330','11111111-1111-4111-8111-111111111111','QA 1329 School','TST-1329','active');

INSERT INTO public.learners(id,tenant_id,first_names,surname)
VALUES ('73000000-0000-4000-8000-000000001331','11111111-1111-4111-8111-111111111111','QA 1329','Learner');

INSERT INTO public.enrolments(id,tenant_id,school_id,learner_id,academic_year,enrolled_from,status)
VALUES ('73000000-0000-4000-8000-000000001332','11111111-1111-4111-8111-111111111111','73000000-0000-4000-8000-000000001330','73000000-0000-4000-8000-000000001331',2026,current_date-30,'current');

INSERT INTO public.guardian_profiles(id,tenant_id,first_names,surname)
VALUES ('73000000-0000-4000-8000-000000001333','11111111-1111-4111-8111-111111111111','QA 1329','Guardian');

INSERT INTO public.learner_guardians(id,tenant_id,learner_id,guardian_id,priority,effective_from)
VALUES ('73000000-0000-4000-8000-000000001334','11111111-1111-4111-8111-111111111111','73000000-0000-4000-8000-000000001331','73000000-0000-4000-8000-000000001333',1,current_date-30);

SELECT set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000001329',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub','73000000-0000-4000-8000-000000001329','role','authenticated','email','qa1329-guardian@example.test')::text,true);
INSERT INTO public.guardian_user_links(id,tenant_id,guardian_id,user_id)
VALUES ('73000000-0000-4000-8000-000000001335','11111111-1111-4111-8111-111111111111','73000000-0000-4000-8000-000000001333','73000000-0000-4000-8000-000000001329');
