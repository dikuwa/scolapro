# ScolaPro Feature Flags & Configuration

## Purpose

ScolaPro must serve different Namibian schools without forking the codebase or hard-coding school-specific modes.

## Configuration Layers

Configuration is resolved from broadest to narrowest:
1. Platform defaults
2. Tenant defaults
3. School configuration
4. Academic-year configuration
5. Department/phase configuration where explicitly supported

More specific settings override broader defaults only for allowed keys.

## Feature Flags

Feature flags control availability of optional or staged capabilities such as:
- hostel;
- school board;
- advanced timetable generation;
- AI lesson preparation;
- OCR;
- WhatsApp integration;
- parent portal;
- learner portal;
- advanced analytics;
- Ministry/regional interfaces.

Flags must not be used to hide broken authorization or substitute for permissions.

## Academic Rules Are Not Feature Flags

Grading, promotion, assessment contribution, subject structures and curriculum versions belong to versioned academic configuration. They must not be implemented as ad-hoc boolean flags.

## School Module Controls

School administrators may enable/disable approved optional modules according to subscription/platform policy. Disabling a module hides operational access but must not delete its historical data.

## Configuration Governance

High-impact settings should have:
- effective date/year;
- changed_by;
- change timestamp;
- optional reason;
- audit event;
- validation before activation.

Examples include term structure, report-card templates, attendance policy options and communication approval requirements.

## Safe Defaults

The default configuration should support a normal Namibian day school with three terms, while allowing official curriculum/rule packs to override where needed.

## Rollout Strategy

Platform-level flags support controlled rollout: internal/testing → pilot schools → selected tenants → general availability. Emergency disablement must be possible for external integrations without taking down the core school system.
