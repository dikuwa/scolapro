-- Retire the one-time service-role helper used to load the verified guardian XLSX
-- enrichment batch. The authoritative batch has been completed and validated, so this
-- temporary production-only ingestion surface must not remain callable.

drop function if exists public.__internal_guardian_load_chunk_20260830(jsonb);
