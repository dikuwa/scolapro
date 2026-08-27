# LTSM, Textbooks and Library

## Purpose

ScolaPro uses one inventory foundation for textbooks, learning materials and general library items while keeping everyday workflows simple.

## User-Facing Areas

### Textbooks & Learning Materials
For subject textbooks, workbooks, teacher resources and departmental stock.

### Library
For general reading material and ordinary library lending.

Both share inventory, copy, issue/return and stock-taking services.

## Core Entities

- title/resource
- subject/grade linkage where applicable
- edition
- publisher/author/series metadata
- physical copy/item
- barcode/asset identifier
- acquisition date/cost
- replacement cost
- condition
- storage/location
- issue transaction
- return transaction
- loss/damage event
- stock-take observation

## Textbook Issue Workflow

1. Choose subject/grade/class.
2. System loads active learner list.
3. Choose or scan textbook copy.
4. Assign copy to learner.
5. Record issue date and condition.
6. At return, scan/select copy and record returned condition.

Phone-camera barcode scanning should be supported so dedicated barcode hardware is optional.

## Statuses

Example copy states:

- available
- issued
- reserved
- damaged
- lost
- under repair
- retired

Do not infer lost solely because an item is overdue.

## Reports and Analytics

- outstanding items by learner
- items by class/grade/subject
- items issued to teachers
- lost/damaged items
- usable stock by subject
- shortage/surplus analysis
- stock-take discrepancies
- learner/item transaction history

## Resource Adequacy

Because active enrolment is known, ScolaPro can calculate shortages automatically.

Example:

Grade 8 Physical Science: 156 active learners, 139 usable learner copies -> shortage 17.

Aggregated data can support school, regional and Ministry planning without exposing individual borrower records.

## Finance Boundary

LTSM stores acquisition/replacement values needed for inventory accountability. Full general-ledger accounting is outside the baseline module and can be integrated later without complicating ordinary textbook workflows.

## Effective History

Issue/return transactions are immutable historical events. Corrections use reversals/amendments with audit history rather than destructive replacement.
