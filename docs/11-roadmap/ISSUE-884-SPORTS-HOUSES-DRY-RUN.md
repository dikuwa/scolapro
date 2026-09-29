# Issue #884 — Namib High School 2026 Sports / Houses Dry-Run Evidence

**Source:** `sports teams.pdf`  
**Scope:** Namib High School only  
**Academic year:** 2026  
**Authoritative base:** `50681f4a7bbd971cb273a4ba9bd8ceb511deb078`  
**Production writes:** NONE

## Source normalization

The 30-page source was normalized with page/row, house, colour, manager, source age group, sex, surname, initials, preferred name and register class provenance.

The source ID-number column was used only as non-authoritative matching evidence. It was not used to update learner identity, DOB, or national ID.

| House | Source rows |
| --- | ---: |
| Eagles | 269 |
| Sharks | 271 |
| Cheetahs | 271 |
| **Total** | **811** |

Source duplicates: **0**

## Learner reconciliation

Read-only reconciliation against the current hosted Namib High 2026 roster:

- Safe learner matches: **811**
- Learner not found: **0**
- Ambiguous learner matches: **0**
- Source duplicates: **0**
- Unexplained/error rows: **0**

Arithmetic:

```text
811 source rows
= 811 safe
+ 0 unmatched
+ 0 ambiguous
+ 0 duplicates
+ 0 unexplained/error
```

The matching contract uses Namib High + 2026 register class + normalized surname plus preferred/display-name evidence. DOB-like source values are supporting evidence only and are not sufficient by themselves to resolve a multi-candidate surname/class collision.

## Assignment disposition

Current hosted Namib High Sports / Houses state for 2026:

- Houses configured: **0**
- Learner house assignments: **0**
- Staff house assignments: **0**
- Canonical sports age groups: **0**

Therefore all safely matched source learners are currently unassigned:

```text
811 safe learner matches
= 0 same-house
+ 811 new assignments
+ 0 conflicting existing-house assignments
```

Locked conflicts: **0**

No assignment writes were performed.

## Register-class reconciliation

| Register class | Source rows | Safe matches | Unmatched | Ambiguous |
| --- | ---: | ---: | ---: | ---: |
| 8A | 48 | 48 | 0 | 0 |
| 8B | 48 | 48 | 0 | 0 |
| 8C | 46 | 46 | 0 | 0 |
| 8D | 47 | 47 | 0 | 0 |
| 9A | 45 | 45 | 0 | 0 |
| 9B | 45 | 45 | 0 | 0 |
| 9C | 46 | 46 | 0 | 0 |
| 9D | 43 | 43 | 0 | 0 |
| 10A | 46 | 46 | 0 | 0 |
| 10B | 44 | 44 | 0 | 0 |
| 10C | 46 | 46 | 0 | 0 |
| 10D | 46 | 46 | 0 | 0 |
| 11A | 52 | 52 | 0 | 0 |
| 11B | 51 | 51 | 0 | 0 |
| 11C | 52 | 52 | 0 | 0 |
| 12A | 35 | 35 | 0 | 0 |
| 12B | 36 | 36 | 0 | 0 |
| 12C | 35 | 35 | 0 | 0 |
| **Total** | **811** | **811** | **0** | **0** |

The current 2026 enrolment roster contains 813 learners. The authoritative sports source contains 811 of them. The two current learners absent from the source are not invented into a house and remain outside the proposed import.

## House reconciliation

No existing Namib High houses were present in the current hosted Sports / Houses store.

Dry-run proposes exactly:

- Eagles — White
- Sharks — Grey
- Cheetahs — Orange

House creation remains production-gated and would use the existing governed `upsert_sports_house(...)` RPC.

## Manager reconciliation

| Source manager | House | Dry-run |
| --- | --- | --- |
| E Sackaria | Eagles | Safe unique staff match |
| S Aikela | Sharks | Review — no current active NHS staff match |
| N Nghiwedua | Cheetahs | Safe unique staff match |

Manager safe matches: **2**  
Manager review: **1**

The unresolved Sharks manager blocks production apply under the bounded script's safety gate.

## Age groups

Source U13–U20 values are retained only as source provenance/reference.

Canonical `sports_age_groups` writes: **NONE**

No school/year sports reference date or age-band configuration was inferred from the PDF.

## Mutation contract

The apply path is intentionally separate from dry-run and can only use existing governed Sports / Houses RPCs:

- `public.upsert_sports_house(...)`
- `public.assign_learners_sports_house(...)`
- `public.assign_staff_sports_house(...)`

Learner imports request:

```text
assignment_source = import
is_locked = true
academic_year = 2026
school = Namib High School
```

Existing locked learner conflicts are classified before apply and the existing RPC also rechecks them transactionally.

## Safety

- Dry-run assignment writes: **0**
- Production assignment writes: **0**
- Learner creation: **0**
- Learner identity mutation: **0**
- National-ID mutation: **0**
- DOB mutation: **0**
- Canonical age-group writes: **0**

**Production apply is NOT authorized.**
