# Issue #884 — Namib High School 2026 Sports / Houses dry-run evidence

Status: read-only dry-run complete; production apply not authorized.

Source:
- sports teams.pdf
- SHA-256: f6937bdc043b04fcd076bd80c8bab972c71a6b3e089e9d6dbfff1017a907e9e0
- pages: 30
- school: Namib High School
- academic year: 2026

## Source normalization

Normalized learner rows: 811
Unique source learner rows: 811
Source duplicates: 0

House totals:
- Eagles: 269
- Sharks: 271
- Cheetahs: 271

Register-class totals:

| Class | Source rows |
| --- | ---: |
| 8A | 48 |
| 8B | 48 |
| 8C | 46 |
| 8D | 47 |
| 9A | 45 |
| 9B | 45 |
| 9C | 46 |
| 9D | 43 |
| 10A | 46 |
| 10B | 44 |
| 10C | 46 |
| 10D | 46 |
| 11A | 52 |
| 11B | 51 |
| 11C | 52 |
| 12A | 35 |
| 12B | 36 |
| 12C | 35 |

## Current hosted baseline

- current 2026 learners: 813
- configured Sports / Houses: 0
- 2026 learner house assignments: 0
- 2026 staff house assignments: 0
- canonical sports age groups: 0
- 2026 sports year settings: not configured

The two current learners absent from the source are outside this import authority and remain untouched.

## Learner reconciliation

Final dry-run:
- safe learner matches: 811
- unmatched learners: 0
- ambiguous learner matches: 0
- unexplained/error rows: 0

Assignment disposition:
- same-house: 0
- new assignments: 811
- conflicting existing assignments: 0
- locked conflicts: 0

Arithmetic:
- source rows: 811 = 811 safe + 0 ambiguous + 0 unmatched + 0 duplicate + 0 unexplained
- safe matches: 811 = 0 same-house + 811 new + 0 conflicting
- unexplained remainder: 0

The matching implementation treats the source reference number as supporting evidence only. It is never written back to learner identity fields.

## Manager reconciliation

- Eagles / E Sackaria: safe unique staff match
- Sharks / S Aikela: manual review
- Cheetahs / N Nghiwedua: safe unique staff match

Manager totals:
- safe matches: 2
- review rows: 1

The Sharks manager is not guessed when the exact initial-plus-surname staff match is unavailable.

## Age groups and writes

Source U13-U20 values remain source provenance only.

Canonical sports_age_groups writes: 0
Dry-run assignment writes: 0
Production assignment writes: 0
Learner creation: 0
Learner identity updates: 0
Staff creation: 0

The bounded apply path uses the existing governed Sports / Houses RPCs with assignment source import and locked-by-default imported assignments.

Production execution remains separately Control Room gated.
