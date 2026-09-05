begin;

select plan(8);

insert into auth.users(id,email,aud,role,created_at,updated_at) values
('fec00000-0000-4000-8000-000000000001','batch-actor-admin@example.test','authenticated','authenticated',now(),now()),
('fec00000-0000-4000-8000-000000000002','batch-actor-teacher@example.test','authenticated','authenticated',now(),now()),
('fec00000-0000-4000-8000-000000000003','batch-actor-principal@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fec00000-0000-4000-8000-000000000001','school_admin',current_date-1),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fec00000-0000-4000-8000-000000000002','teacher',current_date-1),
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fec00000-0000-4000-8000-000000000003','principal',current_date-1);

select lives_ok(
  $$insert into public.report_card_batches(
      id,tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,created_by_user_id
    ) values(
      'fec10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      2026,1,'school','Actor test school','generate','fec00000-0000-4000-8000-000000000001'
    )$$,
  'trusted setup accepts a report-card batch creator with real management authority'
);

select throws_ok(
  $$insert into public.report_card_batches(
      tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      2026,1,'school','Forged teacher batch','generate','fec00000-0000-4000-8000-000000000002'
    )$$,
  'Report-card batch creator is not authorized for school',
  'trusted writer cannot attribute a report-card batch to an ordinary teacher'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fec00000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$insert into public.report_card_batches(
      tenant_id,school_id,academic_year,term_number,scope_type,scope_label,operation,created_by_user_id
    ) values(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      2026,1,'school','Spoofed principal batch','generate','fec00000-0000-4000-8000-000000000003'
    )$$,
  'Report-card batch creator must match authenticated actor',
  'authenticated manager cannot name a different authorized leader as batch creator'
);

select lives_ok(
  $$update public.report_card_batches
    set status='processing',started_at=now(),processed_items=0,updated_at=now()
    where id='fec10000-0000-4000-8000-000000000001'$$,
  'worker-owned operational batch state remains mutable'
);

select throws_ok(
  $$update public.report_card_batches
    set created_by_user_id='fec00000-0000-4000-8000-000000000003'
    where id='fec10000-0000-4000-8000-000000000001'$$,
  'Report-card batch identity and creator provenance are immutable',
  'batch creator provenance cannot be rewritten'
);

select throws_ok(
  $$update public.report_card_batches
    set school_id='00000000-0000-4000-8000-000000000001'
    where id='fec10000-0000-4000-8000-000000000001'$$,
  'Report-card batch identity and creator provenance are immutable',
  'batch cannot be moved to another school after creation'
);

select is(
  (select created_by_user_id from public.report_card_batches where id='fec10000-0000-4000-8000-000000000001'),
  'fec00000-0000-4000-8000-000000000001'::uuid,
  'stored batch preserves its original authorized creator'
);

select ok(
  not has_function_privilege('authenticated','app_private.user_can_manage_report_cards(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','app_private.user_can_manage_report_cards(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.enforce_report_card_batch_actor_integrity()','EXECUTE')
  and (select count(*)=1 from pg_trigger
       where tgrelid='public.report_card_batches'::regclass
         and tgname='report_card_batch_actor_integrity_trg'
         and not tgisinternal),
  'report-card batch actor helpers are private and the physical guard is installed once'
);

select * from finish();
rollback;
