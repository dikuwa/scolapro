# NIED Curriculum Registry

## Purpose

ScolaPro maintains a versioned internal curriculum registry derived from official NIED curriculum documents. Teachers must not repeatedly browse, copy, or retype syllabus content to prepare lessons, assessments, schemes, year plans, or coverage reports.

The registry is the authoritative curriculum reference layer used by academic configuration, teaching planning, assessment, reporting, and statutory outputs.

## Core principle

Official curriculum content is imported and structured once, human-verified, versioned, then reused everywhere.

ScolaPro must not live-scrape NIED every time a teacher opens a lesson plan or assessment screen. Curriculum synchronization is a governed platform process.

## Registry hierarchy

The curriculum registry should support:

- education phase
- grade
- subject
- subject code / official reference code where applicable
- curriculum version
- effective academic year range
- official source document and source URL/reference
- syllabus section / theme
- topic
- general objective
- specific objective / basic competency
- practical investigation / practical requirement
- assessment guidance
- recommended sequencing where officially stated
- prerequisite or dependency links
- official terminology

## Versioning

Every curriculum version must be immutable after publication.

A new NIED syllabus creates a new curriculum version rather than overwriting the previous one.

Historical academic records, lesson plans, schemes, assessments, reports, and learner results must continue to reference the curriculum version active when they were created.

Suggested states:

- discovered
- imported
- structured
- under_review
- approved
- published
- superseded
- withdrawn

## Import workflow

1. Platform administrator identifies a new or updated official NIED document.
2. Source document is registered with provenance metadata.
3. Structured extraction creates candidate curriculum items.
4. Human reviewer verifies structure and terminology against the official document.
5. Differences from the previous version are shown explicitly.
6. Approved version is published with effective dates.
7. Schools are notified of applicable curriculum changes.
8. Existing historical records remain attached to their original version.

AI may assist extraction and comparison, but cannot publish curriculum rules autonomously.

## School adoption

National curriculum versions provide the baseline.

Schools may configure operational details such as:

- academic calendar mapping
- pacing
- school-specific teaching sequence
- assessment dates
- resources
- department notes

Schools must not alter the official curriculum text in place. Local adaptations are stored separately as school or department overlays.

## Curriculum entities

### CurriculumSubject
Represents an official subject within a phase/grade context.

### CurriculumVersion
Represents one effective syllabus version.

### CurriculumUnit
A theme/topic grouping.

### CurriculumObjective
General objective attached to a curriculum unit.

### CurriculumCompetency
Specific/basic competency that teaching and assessment may target.

### CurriculumPractical
Official or curriculum-linked practical activity/investigation.

### CurriculumAssessmentRequirement
Official assessment guidance that can influence assessment schemes.

### CurriculumSource
The original NIED document and provenance metadata.

## Relationship to EMIS codes

Curriculum identifiers and EMIS/statutory reporting codes must be modeled separately.

A subject may have:

- an internal ScolaPro subject identifier
- a NIED curriculum identity
- one or more statutory/EMIS/DNEA codes over time

Codes are versioned reference data and must not be used as the primary identity of the subject.

## Teacher experience

Teachers should see human-readable curriculum content, not registry mechanics.

When preparing a lesson, ScolaPro should already know:

- subject
- grade
- curriculum version
- current theme/topic
- general objective
- competency/competencies
- applicable practicals

The teacher focuses on pedagogy rather than copying syllabus text.

## HOD experience

HODs can:

- review curriculum coverage across assigned subjects
- approve department pacing plans
- compare planned vs actual coverage
- identify curriculum-capacity risk
- inspect curriculum changes between versions

## Guardrails

- Never silently replace historical curriculum references.
- Never infer an official curriculum rule and present it as NIED policy without verification.
- Preserve exact official terminology in the registry.
- Store local school interpretation separately from official curriculum data.
- Keep source provenance for every published curriculum item.
- Any AI-generated lesson content must remain clearly separate from official curriculum text.

## Future extensions

- automatic curriculum change alerts
- cross-subject integration suggestions
- competency mastery analytics
- curriculum-resource mapping
- regional curriculum support packs
- Ministry-level aggregate coverage indicators with privacy safeguards
