begin;
select no_plan();

select like(
  pg_get_functiondef('app_private.record_conduct_group(uuid,uuid,text,date,text,text,text,text,uuid[])'::regprocedure),
  '%cardinality(p_learner_ids)>1000%',
  'conduct group recorder accepts up to 1000 learners'
);

select like(
  pg_get_functiondef('app_private.record_conduct_group(uuid,uuid,text,date,text,text,text,text,uuid[])'::regprocedure),
  '%Choose between 1 and 1000 learners%',
  'conduct group recorder exposes the aligned governed limit'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.record_conduct_group(uuid,uuid,text,date,text,text,text,text,uuid[])',
    'EXECUTE'
  ),
  'bulk conduct implementation remains private'
);

select * from finish();
rollback;
