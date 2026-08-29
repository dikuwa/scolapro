-- Parent/guardian message inbox from canonical communication recipients.
-- Only messages explicitly addressed to the signed-in auth user are surfaced here;
-- learner-targeted or school-wide communications are not inferred into parent access.

create or replace function public.get_parent_message_overview(p_limit integer default 50)
returns table(
  recipient_id uuid,
  message_id uuid,
  school_id uuid,
  school_name text,
  channel text,
  subject text,
  body text,
  sensitive boolean,
  sent_at timestamptz,
  delivered_at timestamptz,
  domain_type text,
  domain_id uuid
)
language sql
stable
security definer
set search_path=public,app_private
as $$
  select
    cr.id as recipient_id,
    cm.id as message_id,
    cm.school_id,
    s.name as school_name,
    cm.channel,
    cm.subject,
    cm.body,
    cm.sensitive,
    cm.sent_at,
    cr.delivered_at,
    cm.domain_type,
    cm.domain_id
  from public.communication_recipients cr
  join public.communication_messages cm on cm.id=cr.message_id
  join public.schools s on s.id=cm.school_id
  where auth.uid() is not null
    and cr.user_id=auth.uid()
    and cr.delivery_status='delivered'
    and cm.status in ('sent','partially_sent')
  order by coalesce(cr.delivered_at,cm.sent_at,cm.created_at) desc,cr.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),100));
$$;

revoke all on function public.get_parent_message_overview(integer) from public,anon;
grant execute on function public.get_parent_message_overview(integer) to authenticated;

comment on function public.get_parent_message_overview(integer) is
'Returns only canonical communications explicitly delivered to the signed-in user; it does not infer parent access from learner/class/school audiences.';
