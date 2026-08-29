-- Read-only production verification for ScolaPro.
-- Run against the linked/live database after migrations. Every row should return ok=true.

with checks(name, ok, detail) as (
  values
    ('candidate number governed assignment', to_regprocedure('public.assign_examination_candidate_number(uuid,text,text)') is not null, 'DNEA number assignment RPC'),
    ('guardian absence governed review', to_regprocedure('public.review_guardian_absence_notice(uuid,text,text)') is not null, 'absence review RPC'),
    ('register teacher assignment', to_regprocedure('public.assign_register_teacher(uuid,uuid)') is not null, 'register-teacher governance'),
    ('finance payment verification', to_regprocedure('public.verify_finance_payment(uuid,text)') is not null, 'finance verification RPC'),
    ('transfer approval', to_regprocedure('public.approve_learner_transfer(uuid,date,text)') is not null, 'requested-to-approved transfer RPC'),
    ('accepted admission enrolment', to_regprocedure('public.enrol_accepted_admission(uuid,uuid,text,text,text,date)') is not null, 'admission-to-enrolment handoff'),
    ('report publication', to_regprocedure('public.publish_report_card_snapshot(uuid)') is not null, 'report publication RPC'),
    ('bulk report generation', to_regprocedure('public.build_report_card_snapshots_bulk(uuid[],smallint,text)') is not null, 'bulk report snapshot generation'),
    ('statutory certification', to_regprocedure('public.certify_statutory_snapshot(uuid,text,text)') is not null, 'statutory certification RPC'),
    ('guardian directory search', to_regprocedure('public.search_guardian_directory(uuid,text,integer)') is not null, 'permission-aware guardian lookup'),
    ('year-end rollover publication', to_regprocedure('public.publish_year_end_progression(uuid,uuid,date)') is not null, 'locked progression publication'),
    ('profile correction review', to_regprocedure('public.review_profile_change_request(uuid,text,text)') is not null, 'reviewed learner/guardian correction'),
    ('academic year activation', to_regprocedure('public.activate_academic_year(uuid)') is not null, 'governed academic-year lifecycle'),
    ('minimal learner directory', to_regprocedure('public.search_operational_learner_directory(uuid,text,integer)') is not null, 'non-PII operational lookup'),
    ('scoped raw learner policy', exists(select 1 from pg_policies where schemaname='public' and tablename='learners' and policyname='scoped staff read learner identities'), 'teachers do not receive school-wide raw learner PII'),
    ('scoped report policy', exists(select 1 from pg_policies where schemaname='public' and tablename='report_card_snapshots' and policyname='scoped users read report card snapshots'), 'teacher report access is assignment-scoped'),
    ('platform support role boundary', pg_get_functiondef('app_private.has_school_role(uuid,text[])'::regprocedure) not ilike '%platform_support%', 'platform support does not impersonate school roles'),
    ('immutable rollover receipts', to_regclass('public.year_end_progression_publications') is not null, 'published rollover provenance table'),
    ('reviewed profile changes', to_regclass('public.profile_change_requests') is not null, 'profile correction queue')
)
select name, ok, detail
from checks
order by ok, name;
