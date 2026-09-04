# Annual Education Census (AEC) source authority

**Status checked:** 2026-09-04

## Decision

ScolaPro must keep its Annual Education Census / EMIS reporting source model **form-agnostic** until a current official AEC questionnaire or machine-readable specification is obtained directly from an authoritative Ministry source.

Do not copy current form field codes, page layouts, section numbering, validation rules, or export layouts from Scribd, screenshots, third-party uploads, social media, or an older questionnaire and present them as the current statutory form.

The existing operational/statutory source layer may continue to expose stable school facts such as enrolment by grade and sex, class-group totals, assignment gaps, staffing, subject offerings, attendance and learning-resource dimensions. Form-specific mappings must remain separately versioned and should only be activated against an identified authoritative source edition.

## Authoritative sources verified

The Ministry's EMIS page states that education regions collect data twice per year from state and private schools and that EMIS produces the Fifteenth School Day Report and the Annual Education Census. It currently presents the 2025 Fifteenth School Day Report and the 2023 Annual Education Census as its latest public records.

- Ministry EMIS page: https://moe.gov.na/index.php/dep/dep-fa/dir-pad/emis
- Ministry EMIS downloads: https://moe.gov.na/index.php/downloads/24-resources/29-emis-reports
- Official 2025 Fifteenth School Day Report: https://www.moe.gov.na/index.php/downloads/24-resources/29-emis-reports?download=122%3A15th-school-day-report-2025
- Official 2023 AEC report: https://moe.gov.na/index.php/downloads/24-resources/29-emis-reports?download=47%3Aemis-2023-report-online

The 2025 Fifteenth School Day Report describes the AEC as the comprehensive survey of education data in state and private schools and says it is usually conducted on the first Tuesday of the last trimester.

The public EMIS downloads inspected on 2026-09-04 expose AEC reports through 2023 and Fifteenth School Day reports through 2025. No current official 2024, 2025 or 2026 AEC questionnaire/form was found in the Ministry's public download surface during this checkpoint.

## Evidence that questionnaire details matter

Official AEC reports explicitly refer to the AEC questionnaire and to questionnaire-specific data choices. For example, the Ministry's AEC reports explain that the questionnaire supplies language options and that subject coding can change as subjects are introduced or phased out. Older official reporting also notes that copies of the AEC and Fifteenth School Day questionnaires are useful for understanding the exact questions used to collect data.

This is why a report is useful for understanding statistical dimensions, but it is not a safe substitute for the current questionnaire when implementing exact form mappings.

## ScolaPro implementation rule

Until a current authoritative questionnaire is acquired:

1. Keep `build_school_operational_snapshot(...)` and related source/readiness functions reusable and source-oriented.
2. Continue source dimensions that are independently supported by school records and official published statistics.
3. Keep statutory mappings/versioned form definitions separate from operational source facts.
4. Do not hard-code an AEC form year, field number, section identifier or output layout unless the repository records the exact authoritative source used.
5. Do not mark an AEC form mapping as production-ready merely because its totals reconcile with an old report.
6. When a current questionnaire is obtained, preserve it as a cited source reference and create a new mapping/version rather than rewriting historical mappings in place.
7. Record effective year, source title, source URL/file provenance, retrieval date and any Ministry revision identifier with the mapping.

## Current source readiness already supported

The source layer currently includes useful AEC-style dimensions without pretending to reproduce an unverified form, including:

- learner totals by sex;
- enrolment by grade;
- enrolment by grade and sex;
- learner age distribution;
- register-class / class-group distribution;
- class-group distribution by sex;
- explicit learners missing grade or register-class assignment;
- active staff and allocated teachers;
- teacher allocation/workload summaries;
- subject-offering counts;
- attendance source facts;
- learning-resource source facts;
- register-class teacher readiness added by the later statutory-source migration.

These are appropriate to continue validating and reconciling independently of the final AEC form layout.

## Next authority checkpoint

Before form-specific AEC mapping/export work resumes, obtain one of the following, in preference order:

1. the current questionnaire directly from the Ministry/EMIS public site;
2. a current questionnaire supplied directly by EMIS/Ministry staff or an official regional education office, with edition/year provenance;
3. an official Ministry circular/package containing the questionnaire and completion instructions.

The Ministry EMIS page currently lists the EMIS contact as **(+264) 61 293 3343**, Government Office Park, Luther Street, Windhoek. If the current questionnaire is not publicly downloadable, requesting the current AEC package from EMIS is the preferred next source-acquisition step.

## Non-authoritative references

Third-party copies can be used only as discovery clues. They must not become canonical statutory specifications unless independently matched to an authoritative Ministry copy.

This rule applies to AI agents and human contributors working on ScolaPro. If an implementation request conflicts with this source-authority rule, preserve the generic source model and flag the missing authoritative form instead of guessing the statutory mapping.
