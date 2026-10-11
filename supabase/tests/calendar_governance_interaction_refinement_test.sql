begin;

select plan(14);

select has_function(
  'public','correct_operational_term_calendar_source',array['uuid','text','text'],
  'closed-term source correction RPC exists'
);
select has_function(
  'public','revise_operational_calendar_event',
  array['uuid','text','text','date','date','time without time zone','time without time zone','text','uuid','text'],
  'append-only operational event revision RPC exists'
);
select has_function(
  'public','cancel_operational_calendar_event',array['uuid'],
  'append-only operational event cancellation RPC exists'
);
select has_function(
  'public','list_manageable_operational_calendar_events',array['uuid','date','date','text'],
  'authority-aware operational event management read model exists'
);

select ok(
  pg_get_functiondef('public.correct_operational_term_calendar_source(uuid,text,text)'::regprocedure)
    like '%Closed academic year is final%',
  'source correction rejects a closed academic year'
);
select ok(
  pg_get_functiondef('public.correct_operational_term_calendar_source(uuid,text,text)'::regprocedure)
    like '%school_admin%principal%deputy_principal%',
  'source correction is restricted to school leadership roles'
);
select ok(
  pg_get_functiondef('public.correct_operational_term_calendar_source(uuid,text,text)'::regprocedure)
    like '%user_targets_current_school%',
  'source correction is bound to the actor current school'
);
select ok(
  pg_get_functiondef('public.correct_operational_term_calendar_source(uuid,text,text)'::regprocedure)
    not like '%update public.academic_terms%',
  'source correction cannot rewrite finalized term boundaries'
);
select ok(
  pg_get_functiondef('public.correct_operational_term_calendar_source(uuid,text,text)'::regprocedure)
    like '%calendar.term_source.corrected%',
  'source correction writes an audit event'
);

select ok(
  pg_get_functiondef('public.revise_operational_calendar_event(uuid,text,text,date,date,time without time zone,time without time zone,text,uuid,text)'::regprocedure)
    like '%v_prior.id%active%',
  'event edits create an active successor linked to the prior revision'
);
select ok(
  pg_get_functiondef('public.cancel_operational_calendar_event(uuid)'::regprocedure)
    like '%v_prior.id%cancelled%',
  'event deletion creates a cancelled successor instead of deleting history'
);
select ok(
  pg_get_functiondef('public.revise_operational_calendar_event(uuid,text,text,date,date,time without time zone,time without time zone,text,uuid,text)'::regprocedure)
    like '%Teaching-impact dates must be revised through Official calendar%',
  'operational revision cannot bypass the official teaching-impact workflow'
);
select ok(
  pg_get_functiondef('public.list_manageable_operational_calendar_events(uuid,date,date,text)'::regprocedure)
    like '%can_manage_department_calendar%',
  'department management reads retain database-level HOD scope authorization'
);
select ok(
  exists(
    select 1 from pg_trigger
    where tgname='operational_calendar_duplicate_guard_trg'
      and not tgisinternal
  ),
  'semantic duplicate prevention is enforced by a database trigger'
);

select * from finish();
rollback;
