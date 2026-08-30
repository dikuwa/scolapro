begin;

select plan(2);

select ok(
  to_regprocedure('public.build_report_card_snapshot(uuid,smallint,text)') is not null,
  'report-card snapshot generation keeps the canonical smallint term signature'
);

select is(
  to_regprocedure('public.build_report_card_snapshot(uuid,integer,text)'),
  null::regprocedure,
  'report-card generation does not expose a duplicate integer-term overload'
);

select * from finish();
rollback;
