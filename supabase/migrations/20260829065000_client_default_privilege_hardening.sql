-- Make least-privilege behavior the default for future public-schema objects.
-- Migrations must explicitly grant application RPC execution; anon/authenticated do
-- not inherit destructive relation privileges or blanket function execution.

alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from anon, authenticated;

comment on schema public is
  'Application schema with explicit client capabilities: destructive relation privileges are not default-granted, and new functions require explicit execution grants.';
