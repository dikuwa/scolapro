# ScolaPro Document and File Architecture

## Purpose
ScolaPro must generate official-looking school documents, preserve source files, and keep document history without mixing binary storage with relational business data.

## Separation of concerns
- PostgreSQL stores metadata, ownership, versioning, permissions, relationships and generation state.
- Object storage stores binary files.
- Generated documents are reproducible artifacts from approved/certified source data where practical.

## File classes

### User-uploaded source files
Examples:
- learner identity/support documents;
- evidence for profile-change requests;
- curriculum source PDFs;
- signed forms;
- scanned receipts or LTSM evidence.

### Generated operational documents
Examples:
- class lists;
- attendance summaries;
- lesson plans;
- schemes/year planners;
- mark sheets;
- LTSM issue lists.

### Generated official/certified documents
Examples:
- report cards;
- promotion schedules;
- DNEA registration outputs;
- EMIS/AEC submission artifacts;
- certified statutory exports.

Official artifacts require stronger versioning and immutable linkage to the source snapshot/rule set used to create them.

## Metadata model
`document.files` should capture at least:
- id;
- tenant/school;
- storage bucket/path;
- filename;
- media type;
- byte size;
- checksum;
- classification/sensitivity;
- uploader;
- created timestamp;
- retention category;
- linked entity type/id.

`document.generated_documents` should additionally capture:
- template/version;
- generation parameters;
- source snapshot/revision;
- generated_by;
- generated_at;
- status;
- file id;
- official/certified flag.

## Templates
Document templates must be versioned separately from business logic. Historical official documents must remain reproducible or at minimum retain the exact generated artifact and template version identifier.

Templates should support:
- school logo and school identity;
- Ministry/official field layouts where required;
- phase-specific report structures;
- signatures and stamps where policy allows;
- page numbering and multi-page continuation;
- print-safe typography and spacing.

## Printing principle
A document is not a screenshot of the application UI. Web screens and printed/PDF documents are separate presentation layers over shared data.

## File access
Download URLs should be short-lived/signed for private content. Public buckets are inappropriate for learner records and internal school documents.

Access is checked against the linked business record and document sensitivity, not merely possession of a path.

## Versioning
When a report card or certified form changes after an authorized correction:
1. retain the previous document/revision;
2. create the corrected source revision;
3. generate a new artifact;
4. record reason/actor/time;
5. mark superseded artifacts accordingly without deleting them.

## Signatures
Support both digital workflow acknowledgement and physical signature workflows. Do not imply legal equivalence between a typed/drawn signature and a legally recognized digital signature unless verified against applicable requirements.

Recommended signature event metadata:
- signer identity/role;
- signature method;
- timestamp;
- document version;
- optional signed-file checksum;
- status/revocation if supported.

## Sensitive files
Health, vulnerability, psychological and learner-support attachments require stricter permissions than ordinary learner documents. Storage path obscurity alone is not security.

## Upload safety
Production implementation should include:
- strict file size/type validation;
- malware scanning strategy;
- image/PDF metadata handling where appropriate;
- safe generated filenames;
- checksums;
- no direct execution of uploaded content.

## Retention and deletion
Deletion behaviour depends on record class. Official academic/statutory artifacts are normally retained according to policy; transient uploads/drafts may have configurable retention. Legal/Ministry retention periods remain a policy verification item before production.

## Status
Approved baseline.