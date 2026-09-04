begin;
select plan(2);

select has_function(
  'app_private',
  'guard_school_document_font',
  array[]::text[],
  'school document font guard function exists'
);

select has_trigger(
  'public',
  'school_settings',
  'school_document_font_guard_trg',
  'school settings enforce the Namib High-only Old English treatment'
);

select * from finish();
rollback;
