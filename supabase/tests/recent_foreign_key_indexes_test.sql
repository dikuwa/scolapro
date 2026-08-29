begin;

select plan(12);

select ok(to_regclass('public.admission_applications_learner_idx') is not null,'admission learner FK is indexed');
select ok(to_regclass('public.client_operation_receipts_tenant_idx') is not null,'offline receipt tenant FK is indexed');
select ok(to_regclass('public.guardian_absence_notices_enrolment_idx') is not null,'absence notice enrolment FK is indexed');
select ok(to_regclass('public.guardian_absence_notices_guardian_idx') is not null,'absence notice guardian FK is indexed');
select ok(to_regclass('public.guardian_absence_attachments_uploader_idx') is not null,'absence attachment uploader FK is indexed');
select ok(to_regclass('public.import_batches_archived_by_idx') is not null,'import archive actor FK is indexed');
select ok(to_regclass('public.learner_contributions_enrolment_idx') is not null,'contribution enrolment FK is indexed');
select ok(to_regclass('public.learner_contributions_item_idx') is not null,'contribution item FK is indexed');
select ok(to_regclass('public.profile_change_requests_requester_idx') is not null,'profile-change requester FK is indexed');
select ok(to_regclass('public.progression_publications_source_enrolment_idx') is not null,'rollover source enrolment FK is indexed');
select ok(to_regclass('public.progression_publications_destination_enrolment_idx') is not null,'rollover destination enrolment FK is indexed');
select ok(to_regclass('public.progression_publications_publisher_idx') is not null,'rollover publisher FK is indexed');

select * from finish();
rollback;
