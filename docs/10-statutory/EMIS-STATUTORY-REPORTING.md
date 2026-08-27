# EMIS & Statutory Reporting Architecture

## Purpose

ScolaPro treats statutory reporting as a governed output of normal school operations. Schools should not reconstruct data manually for census day when the system already holds the required learner, staff, timetable, academic, LTSM, governance and infrastructure information.

The architecture supports current and future Namibia-specific returns including 15th School-Day statistics, Annual Education Census workflows, class-level verification, staffing returns, promotion schedules, DNEA readiness/registration exports and other Ministry-defined submissions.

## Core principle

Operational data is captured once, validated continuously, and rendered into versioned statutory submissions.

A statutory return is a certified snapshot, not a separate disconnected database.

## Reporting layers

### Live operational layer
Current school records used every day:

- learner enrolment
- grade/class placement
- attendance
- subjects
- promotion history
- staff profiles
- qualifications
- teacher allocations
- timetable workload
- vacancies
- LTSM/textbooks
- school profile
- board/hostel/infrastructure where applicable

### Readiness layer
Continuously identifies missing or contradictory data needed for statutory reporting.

### Submission snapshot
A dated, versioned and certified dataset representing what the school officially submitted for a reporting cycle.

Historical snapshots remain immutable even after live school data changes.

## Form/template registry

Statutory forms and export definitions must be versioned.

Suggested metadata:

- form key
- official title
- authority
- reporting cycle/year
- version
- effective dates
- source document/reference
- sections/questions/fields
- validation rules
- mapping rules from operational data
- manual verification fields
- certification requirements
- export format
- status: draft / reviewed / published / superseded

A form used in one year must never be silently replaced by a later template.

## Automated population examples

### Learner statistics
Derived from effective-dated enrolment, date of birth, sex, grade/class, enrolment history and learner status.

### Age distribution
Calculated using the official census/reference date, not today's date.

### Repeaters/new entrants
Derived from historical enrolment/progression records and verified exceptions.

### Grade/class groups
Derived from active classes and learner membership.

### Timetable cycle
Derived from published timetable configuration including cycle days, periods and period duration.

### Teacher particulars
Derived from staff profile, appointment details, qualifications, subject allocation and timetable workload.

### Teacher subject workload
Derived from actual published timetable assignments rather than manually entered period counts.

### Vacancies
Derived from school staffing establishment/vacancy records.

### Previous-year pass/fail/promotion
Derived from locked promotion decisions and official results.

### Textbook statistics
Derived from LTSM inventory and learner allocations where the applicable form requires them.

## Verification workflow

A statutory workflow can follow:

1. Reporting cycle opens.
2. ScolaPro creates a provisional snapshot/reference date.
3. Known fields are populated automatically.
4. Validation engine identifies missing/inconsistent records.
5. Responsible roles verify exceptions rather than recounting everything.
6. School administrator reviews institutional/staff sections.
7. Principal certifies the completed return.
8. Inspector/circuit/region review occurs where required.
9. Final submission snapshot is locked.
10. Export/submission package is generated with full audit provenance.

Exact approval stages remain configurable per official process/version.

## Readiness dashboard

The user experience should be exception-driven, for example:

**15th School-Day 2027 — 96% ready**

- Learners ✓
- Classes ✓
- Staff ⚠
- Timetable ✓
- Previous-year promotion ✓
- LTSM ✓

Then show actionable issues such as:

- 2 learners missing date of birth
- 3 teachers missing qualification classification
- 1 subject allocation has no timetable periods
- Grade 9 class total does not reconcile with active enrolment

Users fix the underlying source record, not a copied census-only value, unless the statutory field is genuinely submission-specific.

## Class-level verification

Where a Ministry process requires register/class teacher confirmation, ScolaPro can generate the class section from live records and ask the responsible teacher to verify exceptions.

This is preferable to requiring teachers to manually count learner categories already represented in the system.

## Sensitive statutory data

Some statutory reporting includes sensitive learner-support categories.

The architecture must separate:

- individual operational record permissions
- class/school aggregate statistics
- statutory submission visibility

A teacher or Ministry analyst who may see an aggregate total does not automatically receive access to the individual underlying restricted records.

## Official code registry

ScolaPro maintains versioned mappings for statutory codes such as:

- subject codes
- post/rank codes
- appointment categories
- school classifications
- region/circuit identifiers
- other Ministry/DNEA reference codes

Users work with human-readable labels. Codes are applied automatically to exports.

Reference codes are not used as primary domain identities because official codes may change over time.

## Promotion schedules

Promotion schedules are generated from the approved academic and promotion engine while preserving the familiar official information required by the applicable template, potentially including:

- learner details
- subjects
- maximum/minimum thresholds
- final marks/symbols
- averages
- rank where applicable
- attendance
- years in phase
- recommendation
- ruling/outcome
- certification/signatures

The statutory template must not redefine the promotion rules; it renders the result of the versioned rules engine.

## DNEA readiness and registration

DNEA-related outputs should assemble from authoritative learner identity and subject enrolment data.

Before export/submission ScolaPro should surface readiness issues such as:

- missing/invalid identity fields
- unresolved learner-name verification
- missing subject registration
- invalid subject combination/code mapping
- missing candidate-specific required information

Ordinary internal school assessments and DNEA registration are separate domains sharing learner/subject data.

## Historical integrity

Each submission snapshot must preserve:

- form/template version
- reference/census date
- source record versions where practical
- submitted values
- manual overrides/exceptions
- actor and certification trail
- generated files/exports
- timestamps

Later changes to learner, staff or school data must not mutate the certified historical return.

## Region and Ministry aggregation

Where authorized, certified school submissions can aggregate upward:

School → Circuit/Region → National

Operational dashboards may also provide live aggregate indicators, but these must be clearly distinguished from certified statutory snapshots.

## Guardrails

- Do not force users to retype information ScolaPro already knows.
- Do not silently use today's data for a historical census date.
- Do not overwrite old statutory forms with new versions.
- Do not expose sensitive individual records merely to produce aggregates.
- Do not let manual census edits diverge invisibly from operational source data.
- Do not make EMIS codes part of the UI burden for ordinary users.
- Preserve certification and audit history.

## Product outcome

The target experience is that census day becomes primarily a verification and certification exercise because the school has maintained good operational data throughout the year.
