begin;

select plan(9);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_grading_scale_creator_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_grading_scale_creator_integrity()','EXECUTE'),
  'grading-scale creator helper remains private'
);

select trigger_is(
  'public','grading_scales','grading_scale_creator_integrity_trg',
  'app_private','enforce_grading_scale_creator_integrity',
  'grading-scale creator trigger is installed'
);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('f6e00000-0000-4000-8000-000000000001','grading-scale-hod@example.test','authenticated','authenticated',now(),now()),
('f6e00000-0000-4000-8000-000000000002','grading-scale-principal@example.test','authenticated','authenticated',now(),now()),
('f6e00000-0000-4000-8000-000000000003','grading-scale-unrelated@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6e00000-0000-4000-8000-000000000001','hod',current_date),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','f6e00000-0000-4000-8000-000000000002','principal',current_date);

select throws_ok(
  $$insert into public.grading_scales(tenant_id,school_id,scale_key,version,display_name,effective_from,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','forged','1','Forged scale',current_date,'draft','f6e00000-0000-4000-8000-000000000003')$$,
  'Grading scale creator is not authorized for school',
  'trusted path cannot forge unrelated grading-scale creator'
);

select lives_ok(
  $$insert into public.grading_scales(id,tenant_id,school_id,scale_key,version,display_name,effective_from,status,created_by_user_id)
    values('f6e10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','valid','1','Valid scale',current_date,'draft','f6e00000-0000-4000-8000-000000000001')$$,
  'trusted path can record authorized grading-scale creator'
);

select lives_ok(
  $$update public.grading_scales set display_name='Valid scale revised' where id='f6e10000-0000-4000-8000-000000000001'$$,
  'ordinary grading-scale updates remain allowed'
);

select throws_ok(
  $$update public.grading_scales set created_by_user_id='f6e00000-0000-4000-8000-000000000002' where id='f6e10000-0000-4000-8000-000000000001'$$,
  'Grading scale creator provenance is immutable',
  'creator cannot later be rewritten to another authorized academic leader'
);

select set_config('request.jwt.claim.sub','f6e00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select throws_ok(
  $$insert into public.grading_scales(tenant_id,school_id,scale_key,version,display_name,effective_from,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','client-forged','1','Client forged scale',current_date,'draft','f6e00000-0000-4000-8000-000000000002')$$,
  'Grading scale creator must match authenticated actor',
  'authenticated academic leader cannot claim another manager as creator'
);

select lives_ok(
  $$insert into public.grading_scales(tenant_id,school_id,scale_key,version,display_name,effective_from,status,created_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','client-own','1','Client own scale',current_date,'draft','f6e00000-0000-4000-8000-000000000001')$$,
  'authenticated academic leader can create grading scale under own identity'
);

reset role;

select ok(
  (select with_check from pg_policies where schemaname='public' and tablename='grading_scales' and policyname='academic leaders can create grading scales') ilike '%created_by_user_id%auth.uid%',
  'grading-scale insert RLS remains bound to authenticated actor'
);

select * from finish();
rollback;