# Database drift reconciliation — operational addendum

Author: UI/runtime consistency fixes stream (PR #375). This is a **new operational
document**; it does not modify Control Room, Delivery Ledger or Implementation Status
files (owned by Stream D). It records the exact schema/RPC dependencies behind the
six routes classified as "broken in shared/preview environments" so the control room
can reconcile the target database without code changes.

## Problem

Six authenticated routes fail to render in the shared/preview database while the
same routes pass typecheck, build and loader-level error guards against
source-controlled migrations. Diagnosis across the affected loaders shows every
referenced table, column and RPC **exists in source migrations**. The failure
pattern is therefore **migration drift**: the target database is behind
`main`, so runtime calls hit missing objects and the loaders' error surfaces
render as broken pages.

**Rule honoured in this stream (per the brief):** no duplicate migrations were
created to compensate for unapplied ones, no deployed migration was rewritten,
and no fake UI fallback masks the drift.

## Reconciliation procedure (control room / DB owner)

```bash
# 1. Confirm the target DB's applied migration head
supabase migration list   # or: select * from supabase_migrations.schema_migrations order by version desc limit 10;

# 2. Apply the unapplied source migrations (idempotent, additive)
supabase db push          # resolves drift; does NOT create new objects not already in source

# 3. Verify the objects below exist before re-testing the routes
```

Alternatively, apply only the migrations listed under each route below.

## Route-by-route dependency evidence

### 1. Academic Setup — `/school/setup`

Loader: `src/features/academics/server/structure.ts`

| Dependency | Kind | Source migration |
|---|---|---|
| `grades`, `register_classes`, `schools` | tables | `20260827190000_initial_core.sql` |
| `timetable_cycle_anchors` | table | `20260906063000_timetable_rotating_calendar_anchor.sql` (with `20260906043000_timetable_cycle_modes.sql`) |

Failure signature if drifted: timetable cycle/anchor columns or tables missing →
loader throws → page renders broken.

### 2. School Settings — `/school/settings`

Loader: `src/features/reporting/server/settings.ts` (+ `settings-actions.ts`)

| Dependency | Kind | Source migration |
|---|---|---|
| `get_report_card_school_settings` | RPC | `20260904191500_report_card_school_settings_rpc.sql` |
| report-card settings tables | tables | report-card settings migrations (school settings family) |

Failure signature if drifted: `Could not find the function … get_report_card_school_settings`
— the known historic drift called out in the Control Room.

### 3. CRC Custody — `/school/crc-custody`

Loader: `src/features/crc/server/custody.ts`; lifecycle functions in
`20260905230500_crc_confidential_custody_lifecycle.sql` (+ closure migration
`20260905231500_crc_custody_ci_closure.sql`).

| Dependency | Kind | Source migration |
|---|---|---|
| `prepare_crc_custody`, `authorize_crc_custody` and the custody lifecycle family | RPCs | `20260905230500_crc_confidential_custody_lifecycle.sql` |
| `app_private.can_access_crc_custody_record`, `can_manage_crc_custody_outgoing`, `can_manage_crc_custody_incoming`, `enforce_crc_custody_lifecycle_integrity` | security/lifecycle functions | same |
| custody tables | tables | same |

Failure signature if drifted: custody RPCs missing → custody lifecycle RPCs absent →
page cannot resolve its custody context.

### 4. Guardians — `/school/guardians`

Loader: `src/features/guardians/server/directory.ts` (+ `queries.ts`)

| Dependency | Kind | Source migration |
|---|---|---|
| `guardian_profiles`, `learner_guardians` | tables | `20260828112000_guardian_relationships_contacts.sql` |
| `guardian_contacts`, `guardian_addresses` | tables | `20260828211722_guardian_addresses_and_contact_management.sql` |
| guardian directory search RPC/views | RPCs | `20260829124500_guardian_directory_search.sql`, `20260831123000_paged_guardian_directory.sql` |

Failure signature if drifted: guardian tables/columns missing → directory query errors.

### 5. Timetable — `/timetable`

Workspace loader: timetable server feature.

| Dependency | Kind | Source migration |
|---|---|---|
| `cycle_mode` / cycle-mode tables | columns/tables | `20260906043000_timetable_cycle_modes.sql` |
| `timetable_cycle_anchors` / rotating-calendar anchors | table | `20260906063000_timetable_rotating_calendar_anchor.sql` |

Failure signature if drifted: cycle mode/anchors missing (the known historic
"timetable cycle mode/anchors" drift from the Control Room).

### 6. Report Cards — `/reports/report-cards`

Loader: `src/features/reporting/server/*` (scope summary first).

| Dependency | Kind | Source migration |
|---|---|---|
| `get_report_card_scope_summary` | RPC | `20260831140000_paged_report_card_status.sql` |
| `get_report_card_school_settings` | RPC | `20260904191500_report_card_school_settings_rpc.sql` |
| report-card status/views | views/tables | report-card family migrations |

Failure signature if drifted: scope-summary RPC missing → the page's first server
call fails before any rendering.

## Verification after reconciliation

1. `supabase db push` completes with no "new migration" prompts (only applying
   source-controlled files).
2. Each route above loads with data (or clean empty states) for a user whose
   membership role matches that route's gate.
3. No loader console errors of the form `relation … does not exist` /
   `function … does not exist`.
4. Update `docs/11-roadmap/IMPLEMENTATION-STATUS.md` (Stream D) to record that
   the six routes are environment-drift reconciled, not code-changed.

## Related source-defect fix in this PR

While classifying, the stream found and fixed a genuine latent source defect
(`memberships[0]` nondeterministic selection), now hardened repo-wide:
`getUserContext` orders memberships newest-first with a stable id tie-breaker,
and role-gated surfaces select membership by required role. See PR #375 commits.
