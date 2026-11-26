-- Serialize duplicate active submissions at the database boundary. The RPC's
-- preflight check remains a friendly fast path, but cannot protect two
-- concurrent transactions that both observe no existing notice.
create unique index guardian_absence_notices_active_period_uidx
on public.guardian_absence_notices(learner_id, absence_from, absence_to)
where status in ('submitted', 'under_review', 'accepted');

comment on index public.guardian_absence_notices_active_period_uidx is
'Allows at most one active guardian absence notice per learner and exact absence period; withdrawn, returned and closed notices remain available for their lifecycle rules.';
