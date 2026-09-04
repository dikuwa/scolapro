begin;

select plan(2);

select ok(
  to_regclass('public.detention_session_supervisors_assigned_by_user_idx') is not null,
  'detention duty assignment actor FK is indexed'
);

select ok(
  to_regclass('public.detention_session_supervisors_tenant_idx') is not null,
  'detention duty tenant FK is indexed'
);

select * from finish();
rollback;
