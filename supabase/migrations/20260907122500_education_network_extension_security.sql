-- btree_gist is required for effective-period exclusion constraints, but its
-- helper functions are extension internals and must not expand the public/anon
-- executable function surface.

alter extension btree_gist set schema extensions;
