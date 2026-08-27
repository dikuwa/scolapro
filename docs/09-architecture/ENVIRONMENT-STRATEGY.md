# ScolaPro Environment Strategy

## Environments

ScolaPro uses clearly separated environments:

- local development
- preview / pull request
- staging
- production

Production data must never be copied casually into development or preview environments.

## Environment Variable Classes

### Public browser-safe
Variables explicitly safe for client exposure only.

### Server-only
Database/service credentials, signing keys, provider secrets, internal URLs and privileged tokens.

### Environment-specific
URLs, analytics keys, queue endpoints, storage configuration and feature defaults.

## Local Development

Use `.env.local` and never commit secrets.

Provide `.env.example` with variable names and safe descriptions but no real values.

Local development should support:
- local Supabase where practical;
- isolated seed data;
- deterministic demo users/roles;
- provider stubs where external service use is unnecessary.

## Preview Environments

Each pull request may receive a preview deployment. Preview environments must:
- use non-production database resources;
- disable or redirect real outbound communications;
- use safe analytics/test projects;
- prevent accidental statutory submissions or real parent messaging.

## Staging

Staging should closely mirror production configuration while using isolated data and credentials.

It is the required environment for:
- release candidate verification;
- migrations;
- RLS tests;
- background jobs;
- email/SMS/WhatsApp provider integration tests;
- PWA/offline validation;
- PDF/print QA.

## Production

Production changes require:
- reviewed migration plan;
- successful CI;
- backup/recovery confidence;
- no unresolved security/RLS failures;
- release notes for material workflow changes.

## Secrets

Never:
- commit secrets;
- log secrets;
- expose service-role tokens to the browser;
- place secrets in public analytics events.

## Seed Data

Seed data must be explicitly synthetic. Avoid real learner names, marks, health records, guardian details or contact information.

## Provider Safety Switches

Outbound integrations should support environment-level safety controls such as:
- `COMMUNICATIONS_ENABLED=false`
- redirect-to-test-recipient behavior;
- dry-run exports;
- AI provider test mode where supported.

## Database Migrations

Migrations move forward through environments in order:

```text
local -> preview/staging -> production
```

Never manually patch the production schema without recording a migration.
