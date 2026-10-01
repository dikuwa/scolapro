-- #934: collapse notification unread-count + latest rows into one request.
--
-- SECURITY INVOKER is deliberate: existing notification RLS remains the
-- authorization authority. The function also self-scopes to auth.uid().

create or replace function public.get_my_notification_inbox(p_limit integer default 8)
returns table (
  unread_count bigint,
  notifications jsonb
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  with visible as materialized (
    select
      n.id,
      n.severity,
      n.title,
      n.body,
      n.href,
      n.read_at,
      n.created_at
    from public.notifications n
    where n.recipient_user_id = auth.uid()
      and n.dismissed_at is null
  ),
  latest as (
    select *
    from visible
    order by created_at desc
    limit greatest(0, least(coalesce(p_limit, 8), 50))
  )
  select
    (select count(*) from visible where read_at is null)::bigint as unread_count,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'severity', l.severity,
            'title', l.title,
            'body', l.body,
            'href', l.href,
            'read_at', l.read_at,
            'created_at', l.created_at
          )
          order by l.created_at desc
        )
        from latest l
      ),
      '[]'::jsonb
    ) as notifications;
$$;

revoke all on function public.get_my_notification_inbox(integer) from public, anon;
grant execute on function public.get_my_notification_inbox(integer) to authenticated;

comment on function public.get_my_notification_inbox(integer) is
  'Returns unread count and latest RLS-visible, non-dismissed notifications for auth.uid() in one authenticated request.';
