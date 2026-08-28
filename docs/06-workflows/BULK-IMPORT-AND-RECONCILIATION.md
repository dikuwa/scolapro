# ScolaPro Bulk Import and Reconciliation

## Purpose

A school adopting ScolaPro must not be forced to type hundreds or thousands of existing learners and staff one record at a time. Bulk import is therefore an onboarding and maintenance workflow, not a raw database upload.

The principle is:

**Template → Stage → Validate → Reconcile → Preview → Commit → Audit**

Imported files never write directly into authoritative tables.

## Initial Templates

The first import family should cover:

1. Learners and current enrolments
2. Grades and register classes
3. Staff directory
4. Subjects and subject offerings
5. Guardian/contact relationships

Later templates may cover learning-resource inventory, opening balances and other operational datasets.

CSV is the canonical interchange format. XLSX is supported for school convenience and is converted into the same staging model before validation.

## Learner Import

A learner row may contain:

- first names
- surname
- preferred name
- date of birth
- sex
- existing admission number
- grade code/name
- register class code/name
- admission/enrolment date
- optional national ID/birth-certificate identifier where permitted
- optional guardian/contact reference for a separate relationship import

The import should accept a school's existing admission numbers. ScolaPro generates an admission number only when a valid existing number is absent.

## Stable Admission Numbers

Admission numbers identify the learner's relationship with a school, not an individual academic-year enrolment.

ScolaPro stores the stable school/learner identifier separately from yearly enrolment. The number remains the same when the learner progresses from one grade/class to another in the same school.

Generated numbers are globally unique by including the school's EMIS identifier (or a stable fallback school code), initial admission year and a school sequence. A manually supplied or imported number must pass uniqueness validation.

An authorized administrator may later reconcile a legacy number through a governed correction workflow. Corrections must be audited; historical enrolments and documents must remain traceable.

A learner should be searchable by current admission number as well as by partial name.

## Reconciliation

The import engine must never rely on names alone for automatic merging.

Potential matches are evaluated in descending confidence using available identifiers such as:

- existing school admission number;
- national ID or birth-certificate number where collected;
- known learner identity plus exact date of birth;
- existing school/learner relationship;
- cautious name/date-of-birth similarity as a **review suggestion only**.

Outcomes are explicit:

- New record
- Exact existing match
- Proposed match requiring review
- Conflict
- Invalid row
- Skip

A human confirms ambiguous reconciliation before commit.

## Grade and Class Reconciliation

Imports should normalize academic codes but never silently merge structurally different grades/classes.

Example: `10A`, `10/A` and `Grade 10/A` may be suggested as possible equivalents when school configuration indicates the same structure, but ScolaPro must show the proposed mapping before commit.

Accidental unused grades/classes remain editable/deletable through normal academic setup. Once operational data references them, correction is governed rather than destructive.

## Import Job Model

An import job records:

- tenant/school
- import type
- source filename
- uploader
- uploaded timestamp
- template/version
- status
- row count
- valid/warning/error counts
- mapping configuration
- reconciliation decisions
- commit timestamp/actor
- audit reference

Suggested lifecycle:

`uploaded → parsing → staged → needs_review → ready → committing → completed`

Failure states preserve diagnostics without partially applying the file.

## Validation

Validation should include at least:

- required fields;
- date formats and realistic date ranges;
- recognized sex/status values;
- duplicate admission numbers within file and database;
- duplicate learner candidates;
- unknown grade/class references;
- class belonging to selected grade/year;
- school/tenant scope;
- row limits and file type;
- formula/macro rejection where XLSX parsing is used;
- no executable content.

## Atomic Commit

Rows are staged first. A final commit uses governed database functions/transactions so a failed batch cannot leave half the school imported.

Large imports may commit in auditable chunks only when the job explicitly records chunk state and can safely resume.

## Guardian Linking

Guardian linking should not make single-learner registration slow or mandatory.

Recommended flow:

- register/import learner first;
- optionally choose **Save & link guardian** for single registration;
- or import guardian/contact relationships as a separate reconciliation stage;
- reuse existing guardian identities when siblings share a parent/guardian;
- keep relationship type, contact priority, permissions and effective dates separate from learner identity.

This prevents duplicate parent accounts and supports one guardian being linked to multiple children.

## Security

Import files can contain sensitive personal information and must use private storage with short retention. Only authorized school administrators/import roles may upload or reconcile. Import diagnostics should avoid exposing sensitive values beyond the person resolving the row.

The public GitHub repository must never contain real school import files or unredacted examples.

## UX

The UI should feel like a guided data-cleanup assistant rather than an Excel database tool:

1. Download template / upload existing file
2. Map columns only when necessary
3. See a concise readiness summary
4. Resolve only exceptions
5. Preview changes
6. Commit
7. Download an import result/report

Schools should spend time fixing genuine exceptions, not re-entering data ScolaPro can understand safely.
