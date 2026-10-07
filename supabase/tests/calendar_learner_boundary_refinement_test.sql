begin;

select plan(6);

select has_function(
  'public',
  'configure_operational_term_calendar',
  array['uuid','date','date','date','date','integer','text','text','text'],
  'operational term calendar RPC exists'
);

select function_returns(
  'public',
  'configure_operational_term_calendar',
  array['uuid','date','date','date','date','integer','text','text','text'],
  'uuid',
  'operational term calendar RPC returns profile id'
);

select has_column(
  'public',
  'academic_terms',
  'starts_on',
  'learner term opening boundary remains canonical'
);

select has_column(
  'public',
  'academic_terms',
  'ends_on',
  'learner term closing boundary remains canonical'
);

select has_column(
  'public',
  'academic_term_calendar_profiles',
  'teacher_starts_on',
  'teacher opening remains separate administrative metadata'
);

select has_column(
  'public',
  'academic_term_calendar_profiles',
  'teacher_ends_on',
  'teacher closing remains separate administrative metadata'
);

select * from finish();
rollback;
