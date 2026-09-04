begin;

select plan(4);

insert into auth.users(id,email,aud,role,created_at,updated_at)
values('fb100000-0000-4000-8000-000000000001','detention-notification-route@example.test','authenticated','authenticated',now(),now());

insert into public.school_memberships(tenant_id,school_id,user_id,role_key,active_from)
values(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'fb100000-0000-4000-8000-000000000001',
  'teacher',
  current_date
);

insert into public.notifications(id,recipient_user_id,tenant_id,school_id,severity,title,body,href)
values
  ('fb110000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','info','Detention supervision assigned','Assigned learner','/late-arrivals'),
  ('fb110000-0000-4000-8000-000000000002','fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','info','Detention duty scheduled','Scheduled duty','/late-arrivals'),
  ('fb110000-0000-4000-8000-000000000003','fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','info','Late-arrival review needed','Management notice','/late-arrivals'),
  ('fb110000-0000-4000-8000-000000000004','fb100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','info','Detention supervision assigned','Explicit alternate route','/notifications');

select is(
  (select href from public.notifications where id='fb110000-0000-4000-8000-000000000001'),
  '/my-detention-supervision',
  'learner-assignment notification routes to the self-scoped workspace'
);

select is(
  (select href from public.notifications where id='fb110000-0000-4000-8000-000000000002'),
  '/my-detention-supervision',
  'scheduled duty notification routes to the self-scoped workspace'
);

select is(
  (select href from public.notifications where id='fb110000-0000-4000-8000-000000000003'),
  '/late-arrivals',
  'unrelated late-arrival management notification keeps its management route'
);

select is(
  (select href from public.notifications where id='fb110000-0000-4000-8000-000000000004'),
  '/notifications',
  'an explicit non-management destination is not overwritten'
);

select * from finish();
rollback;
