# Annual Education Census (AEC) Source Audit

## Status

**Source-grounding document — not a declaration that ScolaPro can yet produce a complete current Ministry AEC return.**

The authoritative source reviewed for this pass is the uploaded Ministry of Education, Arts and Culture document `AEC Form Main (2).pdf`, together with the uploaded AEC Form D/Class Group material where relevant. The questionnaire content is clearly from an older census revision (the instructions reference the 2019 school year in places). Before an AEC export is approved/published for a live reporting cycle, the current Ministry/EMIS revision for that cycle must be verified and registered as a new statutory form version.

## Source rules that ScolaPro must preserve

1. The school EMIS / school code is a four-digit Ministry code and is required at the top of each census page; newly established schools may not yet have a code.
2. The census is completed against a fixed census/reference date in the third trimester. Snapshot generation must therefore remain reference-date based rather than reading mutable "today" totals at export time.
3. Forms are assembled in the order A, B, C, D, E, F, G, H. Form C is ordered by grade/class and Form D alphabetically by teacher.
4. Form B summary totals are not independent data entry. The number of Form C class-group records must reconcile with the class-group total in B.1, and learner totals per grade must reconcile between Form C and B.1.
5. The number of Form D teacher particulars must reconcile with the teacher total in B.1, excluding teachers recorded as having left.
6. Form C requires learner counts by sex and total for each class group and contains grade-composition detail. Multi-grade teaching requires separate forms per grade represented in the combined group.
7. Form D is completed for educational/teaching staff including principals, library/guidance teachers, volunteers, relief teachers and teachers on leave. It includes identity/service, sex, nationality, experience, academic/professional qualification, phase qualification, training, disability and subjects/grades/lessons taught.
8. Forms A, D and E carry previously known information that must be checked/corrected; Forms B, C, F, G and H are principally current-period information in the reviewed revision.
9. The original and regional copy are submitted through the circuit/region process; the third copy is retained by the school.
10. Missing/none/not-applicable conventions and cross-form arithmetic checks belong in form-version validation, not in ad-hoc UI calculations.

## Grade code reference from reviewed form

The reviewed AEC instructions list Ministry grade codes separately from ScolaPro academic grade identifiers:

| Grade | Reviewed AEC code |
| --- | ---: |
| Pre-Primary | 100 |
| Grade 1 | 201 |
| Grade 2 | 202 |
| Grade 3 | 203 |
| Grade 4 | 204 |
| Grade 5 | 205 |
| Grade 6 | 206 |
| Grade 7 | 207 |
| Grade 8 | 208 |
| Grade 9 | 209 |
| Grade 10 | 210 |
| Grade 11 | 211 |
| Grade 12 | 212 |

These values **must not replace** ScolaPro's internal grade codes such as `G8`. AEC codes belong in a versioned statutory mapping/reference layer because Ministry codes can change independently of school academic configuration.

## Current ScolaPro source coverage

`build_school_operational_snapshot(school_id, academic_year, reference_date)` already provides reusable, reference-date-scoped operational facts:

- school identity: name, EMIS number, region and town;
- learner totals and overall female/male/other-or-unspecified counts;
- enrolment totals by grade;
- learner age distribution by sex;
- class distribution and learner counts;
- grade/register-class/subject-offering totals;
- active staff and allocated-teacher counts;
- teacher workload derived from allocations and subject periods;
- attendance source metrics;
- learning-resource source metrics.

This pass adds `learners.by_grade_and_sex`, keeping the source normalized by ScolaPro grade identity while exposing female/male/other-or-unspecified/total counts required for AEC-grade reconciliation.

## Known gaps before a complete AEC mapping can be approved

The reviewed form asks for information that is not yet fully represented in the operational statutory snapshot or, in some cases, not yet represented in normalized ScolaPro master data. These must remain explicit gaps rather than guessed values:

- current Ministry form revision/version and any changed field/code lists;
- explicit AEC grade-code lookup attached to a form version;
- Form C first-time/repeater/returning/condoned learner composition and non-Namibian counts where source data is unavailable;
- medium of instruction and multi-grade composition where not yet normalized;
- full Form D staff particulars (sex, service status, nationality, experience, qualification, rank/post, training, disability, subject qualification) until the staff model supplies those facts reliably;
- teacher mortality and departure-reason history required by B.2;
- physical-facility particulars required by Form E beyond current school/resource data;
- ETSIP indicators and policy/training questions in Form F;
- non-teaching staff and other G/H form dimensions not yet normalized;
- principal/inspector declaration, review and submission workflow presentation;
- form-specific arithmetic/reconciliation rules beyond the generic source snapshot.

## Implementation rule

ScolaPro statutory reporting follows this sequence:

1. **Source facts** are derived from normalized operational tables at a fixed reference date.
2. **Form definitions/versions** describe the Ministry questionnaire revision and field contract.
3. **Mappings** translate source facts to that form version without changing core school identifiers.
4. **Validation** enforces cross-form reconciliation and required/allowed-value rules.
5. **Certification/submission** freezes the reviewed snapshot/mapping result and preserves audit evidence.

A form version must remain draft until its source document revision and all required mappings/validation rules have been verified. A partial mapping must never be presented as a complete Ministry return.
