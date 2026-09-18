-- Issue #478: structural regression for HOD scope configuration hardening.
begin;

select plan(8);

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname='public'
     and tablename='subject_department_responsibilities'
     and policyname in (
       'current school leaders create subject department responsibilities',
       'current school leaders update subject department responsibilities'
     )),
  2,
  'configuration has explicit insert/update policies'
);

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname='public'
     and tablename='subject_department_responsibilities'
     and cmd='DELETE'),
  0,
  'client RLS exposes no delete path for historical HOD responsibilities'
);

select ok(
  (select with_check ilike '%user_current_school_matches%'
   from pg_policies
   where schemaname='public'
     and tablename='subject_department_responsibilities'
     and policyname='current school leaders create subject department responsibilities'),
  'insert configuration is bounded to deterministic current school'
);

select ok(
  (select qual ilike '%user_current_school_matches%'
   from pg_policies
   where schemaname='public'
     and tablename='subject_department_responsibilities'
     and policyname='current school leaders update subject department responsibilities'),
  'update configuration is bounded to deterministic current school'
);

select is(
  (select count(*)::integer
   from pg_trigger
   where tgrelid='public.subject_department_responsibilities'::regclass
     and tgname='subject_department_responsibility_provenance_guard'
     and not tgisinternal),
  1,
  'responsibility provenance guard is installed'
);

select ok(
  pg_get_functiondef('app_private.hod_responsible_for_subject(uuid,uuid)'::regprocedure)
    ilike '%subject_department_responsibilities%',
  'HOD operational authority still derives from subject responsibilities'
);

select ok(
  pg_get_functiondef('app_private.can_author_teaching_plan(uuid,uuid,text)'::regprocedure)
    ilike '%hod_responsible_for_subject%',
  '#479 teaching-plan authority still delegates HOD scope to the governed helper'
);

select ok(
  not has_function_privilege(
    'authenticated'::name,
    'app_private.preserve_subject_department_responsibility_provenance()'::regprocedure::oid,
    'EXECUTE'
  ),
  'clients cannot call the provenance trigger function directly'
);

select * from finish();
rollback;
