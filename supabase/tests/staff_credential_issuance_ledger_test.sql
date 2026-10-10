begin;
select plan(5);
select has_table('public','staff_credential_issuance_attempts','credential issuance ledger exists');
select ok((select relrowsecurity from pg_class where oid='public.staff_credential_issuance_attempts'::regclass),'ledger RLS is enabled');
select ok(not has_table_privilege('authenticated','public.staff_credential_issuance_attempts','INSERT'),'authenticated cannot insert issuance attempts');
select ok(not has_table_privilege('authenticated','public.staff_credential_issuance_attempts','SELECT'),'authenticated cannot read issuance attempts');
select ok(not has_table_privilege('anon','public.staff_credential_issuance_attempts','INSERT'),'anonymous cannot insert issuance attempts');
select * from finish();
rollback;
