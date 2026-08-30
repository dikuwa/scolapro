begin;

select plan(5);

select ok(
  not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_private'
      and has_function_privilege('anon',p.oid,'EXECUTE')
  ),
  'anonymous role cannot directly execute app_private helpers'
);

select ok(
  not exists(
    select 1
    from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace n on n.oid=p.pronamespace
    where not t.tgisinternal
      and n.nspname='app_private'
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
  ),
  'authenticated clients cannot directly invoke app_private trigger functions'
);

select ok(
  not has_function_privilege('anon','public.mark_all_notifications_read()','EXECUTE')
  and not has_function_privilege('anon','public.dismiss_all_notifications()','EXECUTE')
  and has_function_privilege('authenticated','public.mark_all_notifications_read()','EXECUTE')
  and has_function_privilege('authenticated','public.dismiss_all_notifications()','EXECUTE'),
  'notification bulk actions are authenticated-session RPCs only'
);

select ok(
  has_function_privilege('anon','public.get_school_invitation_preview(text)','EXECUTE')
  and has_function_privilege('authenticated','public.get_school_invitation_preview(text)','EXECUTE'),
  'token-scoped school invitation preview remains intentionally public'
);

select ok(
  not exists(
    select 1
    from pg_policies
    where 'anon'=any(roles) or 'public'=any(roles)
  ),
  'no RLS policy requires anonymous direct execution of private authorization helpers'
);

select * from finish();
rollback;
