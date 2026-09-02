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
6. Learner subject registrations

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

## Learner Subject-Registration Import

Learner subject choices use the same source-preserving staging architecture but have a deliberately strict row contract because they become part of the authoritative academic record.

The required import identity is:

`admission_number + academic_year + subject_code + action`

`action` must be one of:

- `register`
- `withdraw`

The importer must not infer a learner from a name. The learner resolves only through the stable school admission number. The academic year is explicit and must not be guessed from the current date. The subject resolves by the school's subject code and then to the learner's exact active school/year/grade subject offering.

A row fails closed when any of the following is true:

- the admission number does not resolve to the school learner;
- the academic year is invalid or does not match an enrolment;
- the enrolment has no grade required for offering resolution;
- the subject code is unknown;
- the exact grade/year offering is missing or inactive;
- the action is unsupported;
- another row in the same batch targets the same enrolment + subject offering.

Duplicate learner-subject rows are errors rather than "last row wins" updates.

### Reconciliation semantics

Subject-registration reconciliation is idempotent and preserves the existing registration identity/history:

- `register` + no registration → create;
- `register` + active registration → skip;
- `register` + withdrawn registration → reactivate/update the same registration identity;
- `withdraw` + active registration → withdraw/update;
- `withdraw` + absent or already-withdrawn registration → skip.

Rows that cannot resolve safely remain review/error rows. The batch cannot become ready while unresolved review/error/link rows remain.

### Commit boundary

A ready subject-registration batch commits through the canonical governed learner-subject register/withdraw RPCs. The import layer does not reproduce or bypass their lifecycle rules.

This means:

- registration and withdrawal audit history stays canonical;
- withdrawal/reactivation preserves the long-lived registration identity;
- every import row receives a durable commit result;
- the completed batch receives a durable import audit event;
- the transaction is atomic rather than partially applying successful rows around a failed row.

Subject-registration import authorization follows the stricter school import-management boundary: Platform Admin, School Admin, Principal or Deputy Principal. HOD access to normal subject-registration management does **not** imply permission to commit bulk imports.

Subject registrations currently remain a non-blocking readiness signal for report/result workflows. Importing them must not silently introduce new hard eligibility enforcement.

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

For learner subject-registration imports, validation additionally includes stable admission-number resolution, explicit academic year, exact active grade/year offering resolution, supported `register`/`withdraw` actions and duplicate enrolment+offering detection.

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

Import staging tables are not a client-side mutation surface. Authenticated clients may read only the staging data their governed role permits; source rows, resolutions and commit results are changed through self-authorizing import RPCs.

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
