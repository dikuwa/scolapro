begin;

select plan(10);

select has_column('public','school_day_overrides','baseline_source','official baseline source is retained');
select has_column('public','school_day_overrides','baseline_reason','official baseline reason is retained');
select has_column('public','school_day_overrides','baseline_teaching_impact','official baseline impact is retained');
select has_column('public','school_day_overrides','baseline_is_school_day','official baseline school-day status is retained');

select has_function(
  'public',
  'remove_school_teaching_day_adjustment',
  array['uuid','date'],
  'safe calendar-adjustment removal RPC exists'
);

select function_returns(
  'public',
  'remove_school_teaching_day_adjustment',
  array['uuid','date'],
  'text',
  'safe calendar-adjustment removal RPC returns the resolution mode'
);

select has_function(
  'public',
  'configure_school_teaching_day',
  array['uuid','date','text','text','uuid','text'],
  'teaching-day configuration RPC remains available'
);

select ok(
  position('baseline_source' in pg_get_functiondef('public.configure_school_teaching_day(uuid,date,text,text,uuid,text)'::regprocedure))>0,
  'teaching-day configuration preserves official baseline provenance'
);

select ok(
  position('restored_baseline' in pg_get_functiondef('public.remove_school_teaching_day_adjustment(uuid,date)'::regprocedure))>0,
  'removal restores official baseline when one exists'
);

select ok(
  position('Official national/regional calendar evidence cannot be deleted' in pg_get_functiondef('public.remove_school_teaching_day_adjustment(uuid,date)'::regprocedure))>0,
  'official baseline rows are protected from destructive school deletion'
);

select * from finish();
rollback;
