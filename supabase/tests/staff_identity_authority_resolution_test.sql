begin;

select plan(6);

select has_function(
  'public',
  'resolve_staff_identity_authority',
  array['uuid','uuid','uuid','uuid','text','text'],
  'bounded authority-resolution RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'authority-resolution RPC is authenticated-only'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%user_can_reconcile_staff%'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%AUTHORIZE MARTIN MUKOYA EMP-001 RESOLUTION%',
  'current-school authority and exact confirmation are required'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%not available for arbitrary identities%'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%EMP-001%',
  'the exceptional path is narrowly bound to the confirmed identity case'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%reconciled_into_staff_member_id%'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%staff.identity.authority_resolved%'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) not ilike '%delete from public.staff_members%',
  'duplicates are retained with reconciliation pointers and audit provenance'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%preserved_secondary_auth_user_id%'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%teacher_allocations%'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%register_classes%',
  'secondary Auth identity and operational reference provenance are explicitly preserved'
);

select * from finish();
rollback;
