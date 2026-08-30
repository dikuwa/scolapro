begin;

select plan(7);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and p.prosecdef
      and exists (
        select 1
        from information_schema.routine_privileges rp
        where rp.specific_schema = n.nspname
          and rp.routine_name = p.proname
          and rp.grantee = 'PUBLIC'
          and rp.privilege_type = 'EXECUTE'
      )
  ),
  0::bigint,
  'security-definer functions in application schemas are never executable by PUBLIC'
);

select results_eq(
  $$
    select p.proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by p.proname
  $$,
  $$values ('get_school_invitation_preview'::text)$$,
  'anonymous execution is limited to the token-scoped invitation preview RPC'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'anonymous users cannot execute app-private security-definer helpers'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) config(value)
        where config.value like 'search_path=%'
      )
  ),
  0::bigint,
  'every application security-definer function pins an explicit search_path'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any(array[
        'claim_communication_delivery_jobs',
        'complete_communication_delivery_job',
        'fail_communication_delivery_job',
        'recover_stale_communication_delivery_jobs',
        'resolve_communication_provider_route',
        'claim_report_card_render_jobs',
        'complete_report_card_render_job',
        'fail_report_card_render_job',
        'recover_stale_report_card_render_jobs',
        'build_report_card_snapshot_management_internal',
        'build_report_card_snapshots_bulk_management_internal',
        'publish_year_end_progression_internal',
        'record_attendance_event',
        'recalculate_finance_invoice',
        'handle_new_auth_user_profile',
        'notify_school_invitation_status_change'
      ]::text[])
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  0::bigint,
  'worker, trigger and management-internal security-definer RPCs stay closed to authenticated clients'
);

select is(
  has_function_privilege('anon', 'public.get_school_invitation_preview(text)', 'EXECUTE'),
  true,
  'invitation preview remains callable before authentication'
);

select is(
  has_function_privilege('anon', 'public.accept_school_invitation(text)', 'EXECUTE'),
  false,
  'invitation acceptance remains unavailable until the user is authenticated'
);

select * from finish();
rollback;
