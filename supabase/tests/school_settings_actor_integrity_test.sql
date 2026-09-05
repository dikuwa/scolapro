begin;

select plan(11);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('feb00000-0000-4000-8000-000000000001','school-settings-admin@example.test','authenticated','authenticated',now(),now()),
('feb00000-0000-4000-8000-000000000002','school-settings-deputy@example.test','authenticated','authenticated',now(),now()),
('feb00000-0000-4000-8000-000000000003','school-settings-teacher@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','feb00000-0000-4000-8000-000000000001','school_admin','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','feb00000-0000-4000-8000-000000000002','deputy_principal','2026-01-01'),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','feb00000-0000-4000-8000-000000000003','teacher','2026-01-01');

select throws_ok(
  $$insert into public.school_settings(tenant_id,school_id,setting_key,setting_value,updated_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','actor.forged','{}','feb00000-0000-4000-8000-000000000003')$$,
  'School setting actor is not authorized for school',
  'trusted writer cannot attribute a school setting to an ordinary teacher'
);

select throws_ok(
  $$insert into public.school_settings(tenant_id,school_id,setting_key,setting_value)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','actor.missing','{}')$$,
  'School setting actor is required',
  'school settings cannot be written without actor evidence'
);

select throws_ok(
  $$insert into public.school_settings(tenant_id,school_id,setting_key,setting_value,updated_by_user_id)
    values('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','actor.badtenant','{}','feb00000-0000-4000-8000-000000000001')$$,
  'School setting tenant must match school tenant',
  'trusted writer cannot manufacture cross-tenant school settings'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','feb00000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$select public.set_school_setting(
    '22222222-2222-4222-8222-222222222222','actor.integrity',jsonb_build_object('enabled',true)
  )$$,
  'governed school-setting RPC remains compatible with actor binding'
);

select is(
  (select updated_by_user_id from public.school_settings
   where school_id='22222222-2222-4222-8222-222222222222' and setting_key='actor.integrity'),
  'feb00000-0000-4000-8000-000000000001'::uuid,
  'governed write stores the authenticated school admin as updater'
);

select throws_ok(
  $$insert into public.school_settings(tenant_id,school_id,setting_key,setting_value,updated_by_user_id)
    values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','actor.auth-forgery','{}','feb00000-0000-4000-8000-000000000002')$$,
  'School setting actor must match authenticated actor',
  'authenticated writer cannot name a different authorized leader as actor'
);

select set_config('request.jwt.claim.sub','feb00000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$select public.save_report_card_school_settings(
    '22222222-2222-4222-8222-222222222222',
    jsonb_build_object('town','Swakopmund','school_name_font','default'),
    jsonb_build_object('show_percentages',false,'show_non_promotional_subjects',true,'show_pass_mark_legend',true,'remarks_mode','manual')
  )$$,
  'deputy principal report-card settings path remains governed and usable'
);

select ok(
  (select bool_and(updated_by_user_id='feb00000-0000-4000-8000-000000000002'::uuid)
   from public.school_settings
   where school_id='22222222-2222-4222-8222-222222222222'
     and setting_key in ('document_profile','report_card_settings')),
  'report-card settings writes are physically attributed to the authenticated deputy principal'
);

select throws_ok(
  $$update public.school_settings set setting_key='actor.rewritten'
    where school_id='22222222-2222-4222-8222-222222222222' and setting_key='actor.integrity'$$,
  'School setting identity and creation provenance are immutable',
  'setting identity cannot be rewritten after creation'
);

select set_config('request.jwt.claim.sub','feb00000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$update public.school_settings set setting_value=jsonb_build_object('enabled',false)
    where school_id='22222222-2222-4222-8222-222222222222' and setting_key='actor.integrity'$$,
  'School setting actor is not authorized for school',
  'ordinary teacher cannot become the updater even through a trusted table write'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_school_settings(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_school_settings(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_school_settings_actor_integrity()','EXECUTE')
  and (select count(*)=1 from pg_trigger
       where tgrelid='public.school_settings'::regclass
         and tgname='school_settings_actor_integrity_trg'
         and not tgisinternal),
  'school-settings provenance helpers are private and the physical guard is installed once'
);

select * from finish();
rollback;
