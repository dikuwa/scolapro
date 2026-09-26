begin;

select plan(8);

select has_table('public','preparation_review_policies','preparation review policy table exists');

select ok(
  exists(
    select 1 from pg_constraint
    where conrelid='public.preparation_review_policies'::regclass
      and pg_get_constraintdef(oid) ilike '%weekly%'
      and pg_get_constraintdef(oid) ilike '%fortnightly%'
      and pg_get_constraintdef(oid) ilike '%term_batch%'
  ),
  'review policy supports weekly fortnightly selected and term batch cadence'
);

select ok(
  has_function_privilege('authenticated','public.set_preparation_review_policy(uuid,text,date)','EXECUTE')
  and not has_function_privilege('anon','public.set_preparation_review_policy(uuid,text,date)','EXECUTE'),
  'cadence policy mutation is authenticated only'
);

select ok(
  pg_get_functiondef('public.set_preparation_review_policy(uuid,text,date)'::regprocedure)
    ilike '%school_admin%principal%deputy_principal%',
  'only school leadership can configure cadence'
);

select ok(
  has_function_privilege('authenticated','public.comment_on_preparation_submission(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.comment_on_preparation_submission(uuid,text)','EXECUTE'),
  'comment-only review is authenticated only'
);

select ok(
  pg_get_functiondef('public.comment_on_preparation_submission(uuid,text)'::regprocedure)
    ilike '%can_review_preparation_submission%',
  'comment-only action reuses canonical review authority'
);

select ok(
  pg_get_functiondef('public.comment_on_preparation_submission(uuid,text)'::regprocedure)
    ilike '%''commented''%',
  'comment-only action appends a commented review event'
);

select ok(
  pg_get_functiondef('public.comment_on_preparation_submission(uuid,text)'::regprocedure)
    not ilike '%update public.preparation_submissions%',
  'comment-only action does not change submission state'
);

select * from finish();
rollback;
