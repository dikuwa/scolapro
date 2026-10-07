begin;

select plan(8);

select has_function(
  'public',
  'search_finance_learners',
  array['uuid','text','integer'],
  'finance learner lookup is present after migration replay'
);

select has_function(
  'public',
  'get_finance_payment_learner_labels',
  array['uuid','uuid[]'],
  'finance payment learner labels are present after migration replay'
);

select has_function(
  'public',
  'get_sports_house_learner_roster',
  array['uuid','integer'],
  'sports-house learner roster is present'
);

select has_function(
  'public',
  'submit_offline_assessment_mark',
  array['uuid','uuid','uuid','numeric','text','text','uuid','uuid'],
  'offline assessment mark replay is present'
);

select has_function(
  'public',
  'record_teaching_actual_idempotent',
  array['uuid','uuid','date','smallint','text','text','text'],
  'offline teaching-actual idempotency is present'
);

select has_function(
  'public',
  'save_lesson_preparation_offline_draft',
  array['uuid','jsonb','jsonb','uuid','timestamptz'],
  'offline lesson-preparation draft replay is present'
);

select has_column(
  'public',
  'lesson_preparations',
  'offline_client_mutation_id',
  'lesson preparation mutation identity column is present'
);

select has_index(
  'public',
  'lesson_preparations',
  'lesson_preparations_offline_mutation_idx',
  'lesson preparation offline mutation index is present'
);

select * from finish();
rollback;
