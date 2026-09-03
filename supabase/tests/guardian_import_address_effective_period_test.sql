-- Revalidation marker after guardian relationship effective-period hardening merged to main.
begin;

select plan(9);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fdf00000-0000-4000-8000-000000000001','guardian-address-period-admin@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fdf00000-0000-4000-8000-000000000001',
  'school_admin',current_date-10
);

insert into public.guardian_profiles(id,tenant_id,first_names,surname,status)
values('fdf10000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Address','Guardian','active');

insert into public.learner_guardians(
  tenant_id,learner_id,guardian_id,relationship_type,priority,effective_from
)
select '11111111-1111-4111-8111-111111111111',sli.learner_id,'fdf10000-0000-4000-8000-000000000001','parent',1,current_date-20
from public.school_learner_identifiers sli
where sli.school_id='22222222-2222-4222-8222-222222222222' and sli.admission_number='DEMO-001';

-- A future physical address has the same value the school is importing today.
-- A future postal primary has a different value. Neither should influence the
-- current import decision.
insert into public.guardian_addresses(
  id,tenant_id,guardian_id,address_type,address_line_1,country,is_primary,effective_from
) values
(
  'fdf20000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'fdf10000-0000-4000-8000-000000000001','physical','Scheduled Same Home','Namibia',true,current_date+10
),
(
  'fdf20000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
  'fdf10000-0000-4000-8000-000000000001','postal','Future Postal Primary','Namibia',true,current_date+10
);

insert into public.import_batches(id,tenant_id,school_id,import_type,source_file_name,status,created_by_user_id)
values(
  'fdf30000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'guardians','guardian-address-periods.xlsx','review','fdf00000-0000-4000-8000-000000000001'
);

insert into public.import_rows(id,batch_id,tenant_id,school_id,row_number,source_data,normalized_data,resolution,issues)
values(
  'fdf40000-0000-4000-8000-000000000001',
  'fdf30000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  2,'{}'::jsonb,
  jsonb_build_object(
    'learner_admission_number','DEMO-001',
    'identity_number','',
    'first_names','Address',
    'surname','Guardian',
    'relationship_type','parent',
    'priority',1,
    'physical_address','Scheduled Same Home',
    'postal_address','Current Postal Address'
  ),
  'review','[]'::jsonb
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fdf00000-0000-4000-8000-000000000001',true);
set local role authenticated;

select lives_ok(
  $$select public.reconcile_guardian_import_batch('fdf30000-0000-4000-8000-000000000001'::uuid)$$,
  'guardian import reconciliation accepts existing learner-linked guardian'
);
select is(
  (select resolution from public.import_rows where id='fdf40000-0000-4000-8000-000000000001'),
  'link',
  'existing current guardian relationship is reused'
);
select is(
  public.mark_import_batch_ready('fdf30000-0000-4000-8000-000000000001'::uuid),
  true,
  'address effective-period batch can become ready'
);
select lives_ok(
  $$select public.commit_guardian_import_batch('fdf30000-0000-4000-8000-000000000001'::uuid)$$,
  'guardian address import commits with future schedules present'
);
reset role;

select is(
  (select count(*)::integer from public.guardian_addresses
   where guardian_id='fdf10000-0000-4000-8000-000000000001'
     and address_type='physical'
     and lower(address_line_1)=lower('Scheduled Same Home')),
  2,
  'future same-value physical address does not suppress a current imported address'
);
select is(
  (select count(*)::integer from public.guardian_addresses
   where guardian_id='fdf10000-0000-4000-8000-000000000001'
     and address_type='physical'
     and lower(address_line_1)=lower('Scheduled Same Home')
     and effective_from=current_date
     and is_primary),
  1,
  'current imported physical address becomes current primary despite future duplicate'
);
select is(
  (select count(*)::integer from public.guardian_addresses
   where guardian_id='fdf10000-0000-4000-8000-000000000001'
     and address_type='postal'
     and address_line_1='Current Postal Address'
     and effective_from=current_date
     and is_primary),
  1,
  'future postal primary does not prevent current imported postal address from becoming primary'
);
select is(
  (select effective_from from public.guardian_addresses where id='fdf20000-0000-4000-8000-000000000001'),
  current_date+10,
  'future physical schedule remains unchanged'
);
select is(
  (select effective_from from public.guardian_addresses where id='fdf20000-0000-4000-8000-000000000002'),
  current_date+10,
  'future postal schedule remains unchanged'
);

select * from finish();
rollback;
