-- RLS already denies these mutation paths, but table-level privileges should match the
-- intended API boundary instead of depending on the absence of a permissive policy.

revoke all on public.learners from anon;
revoke all on public.enrolments from anon;
revoke all on public.school_memberships from anon;

-- Learner/enrolment creation and controlled corrections remain available through the
-- existing governed policies/RPCs. Hard deletion is never an application operation.
revoke delete on public.learners from authenticated;
revoke delete on public.enrolments from authenticated;

-- Memberships are identity/authorization infrastructure. Application mutations are
-- performed through governed invitation/account workflows, not direct table DML.
revoke insert,update,delete on public.school_memberships from authenticated;

grant select,insert,update on public.learners to authenticated;
grant select,insert,update on public.enrolments to authenticated;
grant select on public.school_memberships to authenticated;

comment on table public.learners is
'Long-lived learner identity. Authenticated clients may not hard-delete identities; governed registration/import/correction workflows provide mutations.';
comment on table public.enrolments is
'Effective-dated learner relationship to a school. Authenticated clients may not hard-delete enrolment history.';
comment on table public.school_memberships is
'Authorization membership ledger. Authenticated clients read permitted memberships but do not mutate membership rows directly.';
