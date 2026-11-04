\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000213',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims',
  jsonb_build_object(
    'sub','70000000-0000-4000-8000-000000000213',
    'role','authenticated',
    'email','qa1202-concurrent-invitee@example.test'
  )::text,true);
SET LOCAL ROLE authenticated;
SELECT * FROM public.accept_school_invitation('qa1202-concurrent-token');
COMMIT;
