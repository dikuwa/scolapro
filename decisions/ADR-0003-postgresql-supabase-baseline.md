# ADR-0003: PostgreSQL with Supabase as Initial Managed Data Platform

## Status

Accepted baseline

## Context

ScolaPro needs relational integrity, historical/effective-dated records, strong reporting, multi-tenancy, row-level security, transactional academic workflows and flexible analytics.

## Decision

PostgreSQL is the primary system of record.

Supabase is the preferred initial managed PostgreSQL platform, including object storage and selected platform capabilities where they fit the architecture.

## Why PostgreSQL

- strong relational model
- transactions and constraints
- mature indexing/querying
- excellent reporting/aggregation
- Row Level Security
- JSON support where controlled flexibility is needed
- portable and not tied to one proprietary data model

## Why Supabase initially

- managed PostgreSQL
- RLS support
- object storage
- practical developer tooling
- suitable for an initial small engineering team
- retains PostgreSQL portability

## Constraints

- application authorization is still required; RLS is defense-in-depth, not the only protection
- schema migrations remain source-controlled
- domain logic must not become dependent on opaque vendor-only behavior
- tenant-isolation tests are mandatory
- sensitive storage objects must use authorization-aware access

## Consequences

ScolaPro can begin with low operational overhead while preserving a path to another PostgreSQL hosting environment if future scale, cost, policy or deployment requirements change.
