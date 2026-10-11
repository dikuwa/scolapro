begin;
select plan(7);
select ok(exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='school_invitations' and t.tgname='school_invitation_rotation_acceptance_guard' and t.tgenabled='O' and not t.tgisinternal), 'invitation acceptance trigger is enabled');
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='prevent_invitation_acceptance_before_rotation'),false,'acceptance trigger is not security definer');
select ok(not has_function_privilege('anon','public.prevent_invitation_acceptance_before_rotation()','EXECUTE'),'anon cannot invoke guard');
select ok(not has_function_privilege('authenticated','public.prevent_invitation_acceptance_before_rotation()','EXECUTE'),'authenticated cannot invoke guard');
select ok((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='prevent_invitation_acceptance_before_rotation') ilike '%must_change_password is false%','acceptance guard explicitly demands cleared rotation');
select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='prevent_invitation_acceptance_before_rotation')
   ilike '%new.status = ''accepted''%',
  'the guard applies specifically when accepting an invitation'
);
select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='prevent_invitation_acceptance_before_rotation')
   ilike '%auth.role()%',
  'the guard checks caller authentication context'
);
select * from finish();
rollback;
