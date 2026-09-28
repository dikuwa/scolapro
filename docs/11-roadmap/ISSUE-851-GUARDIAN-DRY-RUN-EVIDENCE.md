# Issue #851 — Guardian Dry-Run Reconciliation Evidence

**Workstream:** Namib High School Parent/Learner Reconciliation Import  
**Issue:** #851  
**Branch:** `control-room/issue-851-nhs-parent-learner-reconciliation`  
**Source roster date:** 26 September 2026  
**Production writes:** NONE

## Source / baseline

- Source learner rows: **814**
- Source guardian relationship rows: **1,466**
- Current NHS learner/guardian relationships: **1,429**
- Current NHS learners: **813**
- Source-only unmatched learner: admission **5044** (10B)
- Raw workbook SHA-256: `54eeed27ce7c2cc7a70a5bce1ec9e211d31a9eb2d76e5705a8c2a5e1ed3e824a`
- Implementation spec SHA-256: `a55215d823d6fe3a1739f748c8624a6ca97bdffb3724e541e64a4bf345d1818a`
- Migration pack SHA-256: `01759a9f5dd95447119b86c736d22c9d564c647bfe054708aa9223c3ae67366c`

The dry-run compared normalized source rows to the read-only hosted Namib High School dataset. Matching used the implemented canonical rules: school admission number for learners; existing active learner-linked exact guardian name first; then exact normalized name + current contact evidence; ambiguous matches fail closed.

## Guardian row disposition

| Disposition | Count |
| --- | ---: |
| Safely linked to existing guardian profile | **1,283** |
| Guardian create candidates | **127** |
| Manual-review rows | **0** |
| Blocked/error rows | **56** |
| Ambiguous guardian matches | **0** |
| **Total** | **1,466** |

The **56 blocked/error rows** comprise:
- **54** rows from the pre-identified 115 focused-review set that remain blocked;
- **2** guardian rows belonging to source-only learner admission **5044**, which cannot be committed until that learner is resolved through the governed learner workflow.

No ambiguous guardian row was auto-linked.

## Relationship reconciliation

Current relationship edges represented by the source: **1,283**

New relationship candidates from deterministic guardian creation rows: **127**

Current relationship edges absent from source: **146**

Stale proposal classification:
- **KEEP: 13** — the learner has a source guardian slot with a missing guardian name, so the workbook cannot safely prove that the current relationship should end.
- **END: 133** — source guardian names are complete for that learner and the current relationship is absent from the authoritative roster. This is a dry-run proposal only; the implementation still requires an explicit `keep` / `end` commit decision.

No stale relationship was changed.

## Arithmetic proof

Source relationship reconciliation:

```text
1,466 source guardian rows
= 1,283 safely represented by existing guardian relationships
+   127 deterministic guardian/relationship creation candidates
+     0 manual-review rows
+    56 blocked/error rows
= 1,466
```

Current relationship reconciliation:

```text
1,429 current NHS relationships
= 1,283 represented by source
+   146 stale candidates absent from source
= 1,429
```

**Unexplained remainder: 0**

## Cross-learner / sibling reuse groups

The normalized pack contains **115** cross-learner guardian dedup/reuse candidate groups.

| Group disposition | Count |
| --- | ---: |
| Safely resolves to one shared existing guardian profile across the source learners | **91** |
| Requires review because current records do not yet prove one shared profile across all source learners | **24** |
| Ambiguous | **0** |
| **Total** | **115** |

These are group-level evidence counts and are intentionally separate from the 1,466 row-level reconciliation counts.

## Focused-review 115 rows

The normalized pack pre-flagged **115** guardian rows:
- 79: no phone/email matching evidence
- 36: missing guardian name

Final dry-run disposition:

| Disposition | Count |
| --- | ---: |
| Safe | **61** |
| Review | **0** |
| Ambiguous | **0** |
| Blocked | **54** |
| **Total** | **115** |

The 61 safe rows have no independent contact evidence but are safely resolved by one exact-name guardian already actively linked to the same learner. The 54 blocked rows are not guessed or auto-created.

## Contact reconciliation

Source contact values were compared to current effective guardian contacts.

- Existing/current contact records represented by source: **2,306**
- Contact additions: **473**
- Review/conflict guardian rows: **38**
- Source contact values contained in those review/conflict rows: **56**

Contact comparisons normalize email case and phone digits only for matching. Source placeholder/missing markers are excluded.

## Address reconciliation

Source physical/postal/work address values were compared with current effective guardian addresses.

- Existing/current address records represented by source: **2,544**
- Address additions: **355**
- Review/conflict guardian rows: **19**
- Source address values contained in those review/conflict rows: **25**

No existing address history is deleted by the reconciliation path.

## Security coverage

Dedicated Issue #851 pgTAP coverage now asserts:

1. **Cross-school denial** — an NHS school administrator cannot run `reconcile_existing_learner_roster_batch(...)` for another school in the same tenant.
2. **Cross-tenant denial** — the same actor cannot run that reconciliation against a school in another tenant.
3. **Stale-relationship authority denial** — `parent_learner_reconciliation_summary(...)`, which exposes stale relationship candidates, is denied outside the actor's school authority.

These assertions are in:

```text
supabase/tests/parent_learner_reconciliation_test.sql
```

The functions under focused authority coverage are:

```text
public.reconcile_existing_learner_roster_batch(uuid, integer)
public.parent_learner_reconciliation_summary(uuid, uuid)
```

The commit path additionally rechecks the same governed school-import authority and requires both batches to belong to the same school and tenant.

## Safety conclusions

- No production data writes were performed.
- No source guardian with ambiguous identity was auto-merged.
- No matched learner UUID is recreated.
- No historical guardian relationship is hard-deleted.
- Stale current relationships remain unchanged until an explicit commit decision.
- Workbook `ID NUMBER` remains excluded from automatic `national_id` mapping.
