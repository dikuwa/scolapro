# Assessment and Marks Lifecycle

## Goal

Define the operational workflow teachers, HODs and school leadership use from assessment setup through official result publication.

## Teacher scope

A teacher must only see subject offerings derived from active teaching allocations. The default path is:

**My Subjects → Grade/Class → Assessment Period → Mark Grid**

No whole-school subject browser is required for ordinary teachers.

## Capture modes

ScolaPro supports two legitimate school/curriculum workflows without forcing either onto every subject.

### Detailed assessment capture

Used where individual CA components are required or useful.

Examples:

- task;
- topic test;
- practical;
- project;
- oral;
- examination papers.

Teachers enter raw marks. ScolaPro calculates the configured result.

### Final-result capture

Used where the active scheme only requires the final official result or where a school currently captures only an authorised final examination mark.

The teacher enters the permitted final value/status. The record still passes through submission, review and locking.

The choice is controlled by the assessment scheme, not a global school switch.

## Mark grid UX

The mark grid is one of the few areas where spreadsheet-like interaction is appropriate.

Required behaviours:

- learner names remain visible while horizontally scrolling;
- keyboard navigation/paste support where safe;
- clear raw maximum in each column header;
- autosave draft state;
- validation before submission;
- absent/exempt/etc. entered as explicit statuses;
- clear calculated totals without making calculated cells editable;
- filters for missing/problem records;
- mobile fallback optimised for one learner or one assessment at a time rather than forcing a giant desktop grid onto a phone.

## Validation

Before submission, ScolaPro checks at least:

- marks greater than allowed maximum;
- negative values;
- blank required records;
- conflicting numeric mark and non-numeric status;
- learner not eligible for subject/assessment;
- duplicate assessment record;
- incomplete mandatory components;
- calculation configuration errors.

Warnings that do not invalidate the submission are separated from blocking errors.

## Submission

Submitting means the teacher declares the selected scope complete. The system records:

- teacher;
- assessment/period scope;
- timestamp;
- completeness summary;
- current calculation version.

After submission, ordinary editing is suspended while review is active unless the submission is returned.

## HOD review

The HOD receives a department-focused queue, not individual notification clutter.

Useful review indicators include:

- completion percentage;
- learners without marks/statuses;
- average/pass rate/symbol distribution;
- suspicious but non-accusatory outliers;
- prior-period comparison where useful;
- teacher notes;
- moderation evidence where required.

HOD actions:

- verify;
- return with reason;
- comment/request evidence.

The HOD should not normally overwrite a teacher's mark directly. Corrections should return to the responsible teacher or use a governed correction action where policy permits.

## Locking

Verified marks can be locked automatically according to school policy or locked by an authorised academic administrator.

A lock must identify its scope. Partial locking is allowed where needed.

## Reopening/correction

Official records are never silently unlocked.

A reopen/correction requires:

- authorised role;
- reason;
- affected scope;
- optional supporting evidence;
- audit trail.

After correction, the data passes through the required verification path again.

## Publication

Parent/learner-visible results must come from approved official results. Schools may configure when published results become visible.

Draft analytics remain available internally but must be labelled provisional.

## Offline capture

Where supported, offline mark entry must:

- cache only authorised classes/assessments;
- preserve unsynchronised local changes;
- surface sync state clearly;
- detect server-side locking/version conflicts;
- never silently overwrite a newer server record;
- require conflict resolution for ambiguous edits.

## Audit events

Events include:

- assessment opened;
- mark created/changed;
- status changed;
- teacher submitted;
- HOD returned;
- HOD verified;
- locked;
- reopened;
- corrected;
- republished.

These events form the academic evidence trail and should be queryable without cluttering the normal teacher interface.
