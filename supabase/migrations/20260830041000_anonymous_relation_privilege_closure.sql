-- Scholar Pro has no anonymous RLS policies. Anonymous product access is deliberately
-- exposed through narrow SECURITY DEFINER RPCs (currently invitation preview), not raw
-- table/view/sequence access. Remove inherited relation privileges across the schema.

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- Prevent newly-created public-schema tables/sequences from silently recreating this
-- broad anonymous surface through owner default privileges.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Reassert the intentional token-scoped anonymous endpoint after relation closure.
revoke execute on function public.get_school_invitation_preview(text) from public;
grant execute on function public.get_school_invitation_preview(text) to anon,authenticated;

comment on function public.get_school_invitation_preview(text) is
'Intentional anonymous token-scoped endpoint. Anonymous roles have no direct public-schema relation privileges.';
