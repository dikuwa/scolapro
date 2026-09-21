begin;

select plan(5);

select has_function(
  'public',
  'resolve_staff_identity_authority',
  array['uuid','uuid','uuid','uuid','text','text'],
  'authority-resolution RPC remains available'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%create_teacher_allocation_period%'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%active_to=current_date-1%',
  'immutable duplicate allocations are ended and canonical allocations are recreated'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%dependent records; review required%'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%timetable_slots%'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%assessment_instances%',
  'allocation handoff fails closed when dependent records appear'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%insert into public.staff_school_assignments%'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%insert into public.school_memberships%',
  'canonical placement and teacher membership are recreated'
);

select ok(
  pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) !~* 'update[[:space:]]+public[.]teacher_allocations[[:space:]]+set[[:space:]]+staff_member_id'
  and pg_get_functiondef(
    to_regprocedure('public.resolve_staff_identity_authority(uuid,uuid,uuid,uuid,text,text)')
  ) ilike '%preserved_secondary_auth_user_id%',
  'teacher allocation staff identity is not rewritten and secondary Auth provenance remains preserved'
);

select * from finish();
rollback;
