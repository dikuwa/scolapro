-- Final cleanup for the foundation slice: the canonical audit integration is the
-- durable schema. Keep the public API surface free of the transitional local
-- audit table name and correct the compatibility terminology used by N03.

comment on table public.school_external_identifiers is
'Effective-dated governed external school identifiers and optional registry links. Legacy schools.emis_number remains compatible and is not rewritten by this table.';
