# ADR-0008 — Grading scale applicability reference date and retrospective activation

- **Status:** Proposed — **requires owner/academic acceptance; not implemented**
- **Date:** 2026-11-26
- **Related:** PR #1333 (combined candidate `5f4d173d`), #1314, #1318, #1330, #1315 (QA-only, not merged)
- **Decision owner:** school owner / academic authority (not the implementation team)

## Context

Two separate questions arose during the grading work and were deliberately **not**
resolved in code, because both are academic policy rather than engineering choices.

### What the code does today

**1. Applicability is evaluated against the term end date.**

`approve_official_subject_result` resolves the school's configured term-end date and
requires the selected grading scale's effective period to cover it
(`supabase/migrations/20261123171000_official_result_term_grading_scale_applicability.sql`,
the `v_scale.effective_from > v_term_end` guard). The approval loader applies the same
reference date when filtering selectable scales
(`src/features/assessment/server/official-result-approval.ts`). Both sides agree, and a
missing term-end date fails closed with "Configure the academic term end date before
approving official results".

**2. Activation is evaluated against the current date.**

`activate_school_grading_scale` requires `effective_from <= current_date <= effective_to`
(`20261122204600_school_grading_scale_governed_configuration.sql`). A scale whose
effective period has already ended therefore **cannot be activated**, even if it is
still the correct scale for a term that ended earlier.

The consequence: a school that configures a scale only after a term closes cannot
activate it, so it cannot approve that term's results. This is a real operational gap,
but closing it means deciding *whether* retrospective activation is permissible.

### The policy question

Two independent decisions, each with materially different consequences:

**Decision A — reference date for applicability.** When deciding whether a scale applies
to a term, compare the scale's effective period against:
- **A1 (current behaviour): the term end date.** The scale must have been in force on
  the last day of the term. Rationale: a result belongs to its term, not to the click
  date; this prevents a later scale from being applied retroactively to earlier results.
- **A2: the result's effective/reporting date within the term.** Allows a scale change
  mid-term to apply to results dated after the change. More flexible, but makes a single
  term's results potentially graded on different scales — which complicates transcripts,
  statutory returns and aggregated reporting.
- **A3: the approval date.** Rejected: it makes the grading definition depend on when a
  staff member clicked Approve, which is not an academic fact and is easily gamed.

**Decision B — retrospective activation.** Should a scale be activatable after its
effective period has ended?
- **B1 (current behaviour): no.** A scale can only be activated while inside its
  effective period. Safest for provenance, but blocks late configuration.
- **B2: yes, with a bounded and audited exception.** Permit activation for a *closed*
  period only for an explicit, audited reason, restricted to school management, and
  never for a period already certified/published under a different scale. Requires an
  amendment or supersession path so the previously used definition is not silently
  rewritten (consistent with ADR-0001).

## Recommendation (for owner consideration — not a decision)

- **A1** — keep term-end applicability. It is already consistently enforced on both the
  loader and the RPC, and it protects historical results from retroactive re-grading.
- **B2, narrowly** — allow retrospective activation *only* as a governed, audited
  correction path for an uncertified term, never rewriting an already-published
  definition. This closes the "configured late" gap without weakening provenance.

If the owner chooses anything other than the current behaviour, the change is **not**
local: it touches activation guards, approval guards, the loader filter, the published
snapshot definition, and the statutory-report provenance, and it needs pgTAP coverage
for every new path. It must be its own PR with its own ADR acceptance.

## Consequences

**If nothing changes (A1 + B1):** the product is internally consistent and fails closed.
Schools that configure grading late cannot approve that term's results and must be told
so by an explicit, actionable message. No historical result can be re-graded by
accident.

**If A2 or B2 is adopted:** the published/certified snapshot must record which scale and
which reference date produced it (the #1330 provenance work already stores a grading
definition fingerprint, which is the correct substrate), and every report that joins
across terms must be reviewed because a term could contain more than one definition.

**Invariant that must hold under every option:** an already-certified/published official
result is never silently re-graded. Any change to a historical grade must go through the
governed correction flow with audit provenance.

## Status

**Proposed.** No code implements A2, A3 or B2. The candidate ships A1 + B1 as described.
This ADR exists so the decision is explicit, bounded and reviewable rather than being
inferred from an implementation detail. It must be accepted or rejected by the school
owner/academic authority before any implementation work begins.
