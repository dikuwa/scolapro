# ADR-0001: Versioned Academic Rules Instead of Grade-Based Hard-Coding

## Status

Accepted

## Context

Namibian academic requirements vary by phase, subject, qualification, year and Ministry/NIED policy. Existing systems and school practice also show that some subjects use detailed continuous assessment while others may capture only final examination results. Promotion and grading rules can change over time.

Hard-coding behaviour by grade number or subject name would make ScolaPro brittle and would cause historical results to change incorrectly when policy evolves.

## Decision

ScolaPro will use independently versioned, effective-dated academic rule sets for:

- assessment schemes;
- grading scales;
- promotion rules;
- curriculum subject definitions;
- report-card templates.

Application code will execute published rule definitions rather than infer policy from grade numbers or subject names.

Published rule versions are immutable. Changes create a new version with traceable source, effective dates and change notes.

## Consequences

### Positive

- Supports current and future Namibia curriculum changes.
- Preserves historical accuracy.
- Allows different assessment patterns by subject/phase/year.
- Makes calculations explainable and auditable.
- Avoids scattered policy logic in UI/API code.
- Enables Ministry/NIED updates without redesigning core tables.

### Costs

- Requires a curriculum/rules registry and publication workflow.
- Configuration and validation are more sophisticated than simple grade conditionals.
- Test coverage must include rule-version boundaries.

## Alternatives considered

### Hard-code by grade/phase

Rejected because it would embed temporary policy assumptions into application code.

### School-defined formulas only

Rejected as the sole approach because nationally governed rules require authoritative, versioned defaults and traceability, while schools may still need controlled local configuration where policy permits.
