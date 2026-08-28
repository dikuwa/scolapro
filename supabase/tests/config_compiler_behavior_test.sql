begin;

select plan(8);

select ok(
  app_private.jsonb_has_credential_key('{"api_key":"must-not-be-stored"}'::jsonb),
  'provider config guard detects a top-level API key'
);

select ok(
  app_private.jsonb_has_credential_key('{"transport":{"credentials":{"sender":"x"}}}'::jsonb),
  'provider config guard detects nested credential-bearing keys'
);

select ok(
  not app_private.jsonb_has_credential_key('{"sender_id":"School A","region":"na","features":{"unicode":true}}'::jsonb),
  'provider config guard permits secret-free operational metadata'
);

select is(
  (public.validate_statutory_mapping_schema('{"fields":[]}'::jsonb)->>'valid')::boolean,
  true,
  'empty generic statutory field list is structurally valid'
);

select is(
  (public.validate_statutory_mapping_schema('{"fields":[{"source_path":["learner","total"],"target_path":["summary","learners"],"expected_type":"number","required":true}]}'::jsonb)->>'valid')::boolean,
  true,
  'statutory mapping validator accepts explicit source and target paths'
);

select is(
  (public.validate_statutory_mapping_schema('{"fields":[{"source_path":[],"target_path":["x"]}]}'::jsonb)->>'valid')::boolean,
  false,
  'statutory mapping validator rejects empty source paths'
);

select is(
  (public.validate_statutory_mapping_schema('{"fields":[{"source_path":["x"],"target_path":["y"],"expected_type":"date"}]}'::jsonb)->>'valid')::boolean,
  false,
  'statutory mapping validator rejects unsupported expected types'
);

select is(
  (public.validate_statutory_mapping_schema('{"fields":[{"source_path":["x"],"target_path":["y"]},{"source_path":["a"],"target_path":["b"]}]}'::jsonb)->>'field_count')::integer,
  2,
  'statutory mapping validator reports the declarative field count'
);

select * from finish();
rollback;
