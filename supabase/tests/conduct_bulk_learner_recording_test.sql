begin;
select no_plan();

select ok(
  position(
    'cardinality(p_learner_ids)>1000'
    in pg_get_functiondef('app_private.record_conduct_group(uuid,uuid,text,date,text,text,text,text,uuid[])'::regprocedure)
  ) > 0,
  'conduct group recorder accepts up to 1000 learners'
);

select ok(
  position(
    'Choose between 1 and 1000 learners'
    in pg_get_functiondef('app_private.record_conduct_group(uuid,uuid,text,date,text,text,text,text,uuid[])'::regprocedure)
  ) > 0,
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
