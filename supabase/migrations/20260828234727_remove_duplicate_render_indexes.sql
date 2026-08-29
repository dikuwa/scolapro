-- Remove generated FK indexes that duplicate explicit named indexes.
drop index if exists public.fkidx_report_card_render_jobs_bf1b7f5caf;
drop index if exists public.fkidx_report_card_render_jobs_6ffb9d2376;
