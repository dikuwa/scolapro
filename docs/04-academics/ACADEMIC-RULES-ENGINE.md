# ScolaPro Academic Rules Engine

## Purpose

The Academic Rules Engine defines how academic years, terms, subjects, assessments, grading, moderation, promotion, reporting, rankings and awards are configured and calculated in ScolaPro.

It must support Namibia-specific rules without hard-coding assumptions such as “all Grade 10 subjects are exam-only” or “every subject uses the same CA formula”. Rules must be versioned, effective-dated and traceable to the curriculum or school policy that authorised them.

## Core principles

1. **Configuration over hard-coding.** Academic behaviour is determined by effective rule sets, not grade-number conditionals in application code.
2. **Raw evidence is preserved.** Raw marks, absence statuses, moderation history and calculation inputs are never silently overwritten by derived values.
3. **Official vs working data are separate.** Teachers may use formative/internal assessments without those marks necessarily contributing to official term results.
4. **Rules are versioned.** Historical results continue to use the rule version in force when they were produced.
5. **Calculations are explainable.** Every displayed derived mark must be reproducible from stored inputs and the applicable rule version.
6. **Missing is not zero.** Absent, exempt, incomplete and withheld are explicit statuses and must never be converted to zero unless a governed rule explicitly requires it.
7. **Approval matters.** A calculated mark can exist before it becomes an approved official mark.
8. **Ministry outputs are consumers of academic data.** Report cards, promotion schedules, EMIS statistics and DNEA readiness must reuse approved source records rather than request re-entry.

---

## 1. Academic structure

### Academic Year

An academic year belongs to a school/tenant and contains:

- name/year label;
- start and end dates;
- status: planned, active, closed, archived;
- curriculum/rule versions in force;
- term or semester structure;
- school calendar reference.

### Academic Period

ScolaPro must support both term- and semester-based structures. A period records:

- period type;
- sequence;
- opening and closing dates;
- teaching start/end dates where different;
- mark-entry window;
- report publication date;
- locking state.

No calculation logic should assume exactly three terms even though three-term operation is common in Namibian schools.

---

## 2. Subject offerings

A **Subject Offering** is the intersection of:

- academic year;
- curriculum subject/version;
- phase/grade;
- school;
- class/group where applicable;
- assigned teacher(s).

The subject offering controls which learners and teachers can participate in marks capture and analysis.

It also records whether the subject is:

- promotional;
- non-promotional;
- examinable;
- CA-contributing;
- formative-only;
- practical/project based;
- externally examined;
- school-assessed.

These characteristics must be configured by the applicable curriculum rule set rather than inferred from subject name or grade.

---

## 3. Assessment scheme model

An **Assessment Scheme** defines how a subject result is produced for a grade and period.

A scheme contains one or more assessment components, for example:

- topic task;
- class test;
- practical investigation;
- project;
- oral;
- continuous assessment subtotal;
- examination Paper 1;
- examination Paper 2;
- examination Paper 3;
- end-of-term examination;
- year-end examination.

Each component supports:

- component type;
- title/code;
- raw maximum mark;
- contribution weight;
- conversion target;
- mandatory/optional status;
- contributes-to-official-result flag;
- formative/reporting-only flag;
- period applicability;
- learner eligibility rules;
- moderation requirement;
- sequence/date window.

### Contributing vs non-contributing assessment

A teacher may record an assessment that is useful pedagogically without it contributing to the official result.

Therefore assessment records must explicitly distinguish:

- **contributory** — participates in official calculations;
- **formative/internal** — available for progress analysis but excluded from the official term result;
- **external/imported** — official result supplied from an external examination process.

---

## 4. Raw marks, weights and conversions

Teachers should normally enter raw marks.

Example:

- Paper 1: 82 / 120
- Paper 2: 47 / 80

The rules engine performs configured conversion/weighting and preserves:

1. raw mark;
2. raw maximum;
3. converted percentage/value;
4. weight;
5. contribution to final result;
6. rule version used.

A calculation must never destroy the raw input.

### Multiple examination papers

An examination may contain multiple papers with different totals and weights. The engine must support both:

- aggregate raw-total conversion; and
- individually weighted papers.

The applicable scheme determines which method is valid.

### Rounding

Rounding rules are explicit configuration and must state:

- intermediate rounding policy;
- final mark decimal precision;
- symbol-boundary behaviour.

Internally, calculations should preserve sufficient precision and round only according to the configured rule.

---

## 5. Mark status model

A mark entry is not always a numeric value. Supported states should include at minimum:

- present / numeric result;
- absent;
- exempt;
- incomplete;
- withheld;
- not assessed;
- pending.

Schools may configure additional governed statuses, but free-text statuses should not influence calculations.

A status and a mark are separate fields so that audit history remains clear.

---

## 6. Grade and symbol bands

A **Grading Scale Version** contains ordered bands, for example:

- minimum percentage;
- maximum percentage or open upper bound;
- symbol;
- description;
- optional points/value;
- pass/fail classification.

The engine must not hard-code A–U even where that is a common Namibian scale. Different phases, qualifications or future curricula may use different scales.

A result stores the grading scale version used so historical symbols never change because a later scale was edited.

---

## 7. Mark-entry permissions and lifecycle

Teachers should only see marks entry for assigned subject offerings.

A mark-entry window follows a governed lifecycle:

1. **Not Open** — visible if appropriate, but editing disabled.
2. **Open** — authorised teachers may capture/edit.
3. **Draft** — work in progress and autosaved.
4. **Submitted** — teacher declares the set ready for review.
5. **HOD Review** — department moderation/verification.
6. **Returned** — HOD sends back with reason/comments.
7. **Verified** — academic review complete.
8. **Locked** — official values immutable through ordinary editing.
9. **Reopened** — exceptional controlled reopening with reason and audit trail.

Schools may use a leaner route, but statuses must remain explicit and auditable.

### Locking

Locking must be scoped appropriately, e.g. by:

- assessment component;
- subject/class;
- academic period;
- grade;
- school.

A locked result may only be changed through an authorised correction workflow. The original value, replacement value, reason, actor and timestamp are retained.

---

## 8. Moderation and verification

Moderation is distinct from mark entry.

HODs and other authorised reviewers should be able to:

- view completeness;
- identify missing/invalid marks;
- inspect assessment statistics;
- review unusual outliers;
- comment;
- return a submission;
- verify/approve;
- record moderation evidence where required.

ScolaPro should assist with anomalies but must not automatically accuse teachers or change marks.

---

## 9. Derived official results

A **Result Calculation** is produced from:

- eligible assessment entries;
- assessment scheme version;
- grading scale version;
- applicable academic period;
- learner enrolment/subject eligibility.

It records calculation provenance so the result can be explained later.

A calculated result becomes an **Official Result** only after the required approval/locking lifecycle is satisfied.

Working analytics may use draft results, but they must be visibly labelled as provisional.

---

## 10. Promotion engine

Promotion must be a separate, versioned rules engine. It must not be reduced to a single overall average.

A **Promotion Rule Set** may evaluate:

- promotional subjects;
- subject-specific minimums;
- number/type of permitted failures;
- required language/Mathematics conditions where applicable;
- attendance requirements;
- years in phase;
- condonation rules;
- exemptions;
- previous promotion status;
- school/region/Ministry recommendation and ruling fields;
- special-case authorised decisions.

Possible output statuses may include values such as:

- promoted;
- pass;
- condoned;
- not promoted;
- transferred;
- pending ruling.

The definitive allowed statuses and rules must come from the applicable current Ministry/curriculum source, not assumptions based on old SchoolLink forms.

### Promotion decision provenance

Every decision stores:

- calculated recommendation;
- rule version;
- human ruling if applicable;
- override reason;
- authorised actor;
- certification state;
- timestamp.

The system should generate familiar promotion schedules from these records.

---

## 11. Report cards

A report card is a generated document/view over approved academic and attendance data.

It may contain:

- learner and school identity;
- subject results;
- raw/final mark where policy permits;
- percentages;
- symbols;
- class/grade average;
- comments;
- overall total/average;
- rank if the school enables it;
- attendance;
- promotion/result status;
- next-term opening date;
- signatories/stamp.

Report-card templates are versioned separately from academic rules so schools can change presentation without changing historical calculations.

---

## 12. Rankings

Ranking is optional and school-policy controlled.

If enabled, ScolaPro must define explicitly:

- cohort being ranked;
- subjects included;
- treatment of missing/exempt results;
- tie handling;
- rounding basis;
- whether ranking is displayed to learners/parents.

The system must not assume every school or phase uses rank order.

---

## 13. Targets and academic awards

### Targets

A teacher/department may define a target for a class/subject/term. At period close the actual result is derived automatically.

Target reporting can include:

- target average;
- actual average;
- variance;
- pass rate;
- quality-symbol rate;
- contextual notes.

Targets must be planning/management tools, not simplistic teacher-performance scores.

### Awards

Award rules may be configured for:

- top N learners;
- highest subject mark;
- most improved;
- achievement threshold;
- merit criteria.

Awards must use approved results and transparent tie rules. Outputs may feed certificates, lists and mail-merge exports.

---

## 14. Analytics

The same approved result data should drive:

- class averages;
- grade averages;
- subject averages;
- pass/fail rates;
- symbol distributions;
- median and spread;
- target vs actual;
- learner longitudinal trends;
- competency/topic analysis when assessment components are curriculum-linked;
- school/region/Ministry aggregates where authorised.

Analytics must clearly distinguish provisional from official results.

---

## 15. Versioning and effective dates

The following are independently versioned:

- curriculum subject definition;
- assessment scheme;
- grading scale;
- promotion rule set;
- report-card template;
- academic calendar/period structure where needed.

A version has:

- effective-from date/year;
- effective-to date/year where closed;
- source/reference;
- status: draft, reviewed, published, retired;
- change notes;
- approving authority.

Published versions are immutable. Corrections create a superseding version rather than silently editing history.

---

## 16. Audit requirements

Audit history is required for:

- mark create/update;
- status changes;
- submission;
- moderation comments;
- verification;
- locks/reopens;
- academic-rule publication;
- promotion overrides;
- report publication/correction.

Audit records must identify actor, timestamp, scope, before/after values where applicable, and reason for governed changes.

---

## 17. Initial implementation boundaries

The first production implementation should support the full architecture while prioritising these paths:

1. teacher subject/class scope from timetable/allocation;
2. configured assessment schemes;
3. raw mark capture and calculations;
4. final/exam-only mark capture where that is the active school scheme;
5. absent/non-numeric statuses;
6. teacher submission;
7. HOD verification/return;
8. locking and controlled reopening;
9. grading/symbol calculation;
10. term report-card data;
11. promotion-rule execution;
12. academic analysis.

Advanced statistical analysis may follow without changing the core model.

## Non-negotiable anti-patterns

ScolaPro must not:

- encode academic policy as scattered `if grade >= ...` statements;
- treat blank marks as zero;
- overwrite raw marks with converted marks;
- let teachers edit subjects/classes they are not assigned;
- silently recalculate historical results using newer rules;
- publish provisional results as official;
- make promotion a single hard-coded average threshold;
- require re-entry of approved academic data for report cards, promotion or statutory reporting.
