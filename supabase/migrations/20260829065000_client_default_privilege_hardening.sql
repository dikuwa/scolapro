-- Make least-privilege behavior the default for future public-schema objects.
-- ScolaPro public tables/functions are owned and created by postgres, so harden that
-- migration owner. Supabase-managed role defaults are not modified by application
-- migrations because the migration role is not authorized to rewrite them.

alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

comment on schema public is
  'Application schema with explicit client capabilities: destructive relation privileges are not default-granted for postgres-owned objects, and new functions require explicit execution grants.';
