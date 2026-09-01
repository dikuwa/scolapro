begin;

select plan(5);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fe000000-0000-4000-8000-000000000001','school-invitation-scope@example.test','authenticated','authenticated',now(),now());

insert into public.tenants(id,name,slug)
values
  ('fe100000-0000-4000-8000-000000000001','Invitation Scope Tenant A','invitation-scope-tenant-a'),
  ('fe100000-0000-4000-8000-000000000002','Invitation Scope Tenant B','invitation-scope-tenant-b');

insert into public.schools(id,tenant_id,name,emis_number,region,town)
values
  ('fe110000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','Invitation Scope School A','INV-SCOPE-A','Khomas','Windhoek'),
  ('fe110000-0000-4000-8000-000000000002','fe100000-0000-4000-8000-000000000002','Invitation Scope School B','INV-SCOPE-B','Khomas','Windhoek');

select throws_ok(
  $$insert into public.school_invitations(tenant_id,school_id,email,role_key,token_hash,invited_by_user_id)
    values('fe100000-0000-4000-8000-000000000002','fe110000-0000-4000-8000-000000000001','bad@example.test','teacher','inv-scope-bad','fe000000-0000-4000-8000-000000000001')$$,
  'School invitation scope mismatch: school does not belong to tenant',
  'invitation tenant must match school tenant'
);

select lives_ok(
  $$insert into public.school_invitations(id,tenant_id,school_id,email,role_key,token_hash,invited_by_user_id)
    values('fe120000-0000-4000-8000-000000000001','fe100000-0000-4000-8000-000000000001','fe110000-0000-4000-8000-000000000001','valid@example.test','teacher','inv-scope-valid','fe000000-0000-4000-8000-000000000001')$$,
  'valid same-school invitation remains allowed'
);

select throws_ok(
  $$update public.school_invitations
    set tenant_id='fe100000-0000-4000-8000-000000000002', school_id='fe110000-0000-4000-8000-000000000002'
    where id='fe120000-0000-4000-8000-000000000001'$$,
  'School invitation tenant and school are immutable',
  'invitation tenant/school identity cannot be moved after creation'
);

select lives_ok(
  $$update public.school_invitations set status='revoked' where id='fe120000-0000-4000-8000-000000000001'$$,
  'ordinary invitation lifecycle updates remain allowed'
);

select ok(
  not has_function_privilege('authenticated','app_private.enforce_school_invitation_scope_integrity()','EXECUTE')
  and not has_function_privilege('anon','app_private.enforce_school_invitation_scope_integrity()','EXECUTE'),
  'school invitation integrity helper is private from client roles'
);

select * from finish();
rollback;
