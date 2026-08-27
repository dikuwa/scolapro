# ADR-0002: Start ScolaPro as a Modular Monolith

## Status

Accepted

## Context

ScolaPro contains many tightly connected education domains: learners, enrolment, curriculum, timetable, attendance, assessment, promotion, statutory reporting, LTSM, communications and longitudinal history.

The early engineering team must be able to evolve the system quickly while preserving transaction integrity and minimizing operational overhead.

## Decision

ScolaPro will begin as a modular monolith.

Domain boundaries are explicit in code and documentation, but the primary application is deployed as one coherent system with PostgreSQL as the transactional source of truth.

## Why

- simpler deployment and debugging
- easier transactional consistency
- lower infrastructure overhead
- easier AI-assisted coding and review
- avoids premature distributed-system complexity
- domain boundaries can still support future extraction if scale warrants it

## Rejected alternative

Starting with microservices was rejected because it would introduce network boundaries, distributed transactions, service ownership, observability and deployment complexity before real scale requirements justify them.

## Consequences

- modules must not become an unstructured shared-code base
- cross-domain access should go through clear services/contracts where practical
- background processing may run separately while remaining part of the same product architecture
- extraction of a domain into a service remains possible later
