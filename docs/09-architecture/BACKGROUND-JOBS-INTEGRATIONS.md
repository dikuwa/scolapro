# ScolaPro Background Jobs & Integrations

## Purpose

ScolaPro includes work that should not block an interactive request: notifications, document generation, AI assistance, OCR, analytics refreshes, census snapshot preparation and external provider callbacks.

## Job Categories

### User-triggered asynchronous jobs
Examples: PDF generation, bulk report packs, bulk textbook labels, large exports.

### Scheduled jobs
Examples: attendance follow-up, overdue books, licence/document expiry where applicable, term readiness checks, backup verification, curriculum update checks.

### Event-driven jobs
Examples: send parent notification after approved absence notice, update aggregates after verified marks, generate report-card bundle after term lock.

## Durable Job Model

Jobs require:
- unique ID;
- tenant/school scope;
- job type;
- payload/reference IDs;
- status;
- attempt count;
- idempotency key;
- created/started/completed timestamps;
- failure reason.

Business records remain authoritative; job queues are execution mechanisms, not the source of truth.

## Provider Adapters

Integrations must be abstracted behind stable internal interfaces:
- SMS provider;
- WhatsApp/business messaging provider;
- email provider;
- AI provider/gateway;
- OCR provider;
- object storage;
- PDF renderer;
- optional payment provider.

Provider-specific IDs are stored alongside internal IDs for traceability.

## Retry Policy

Transient failures may retry with exponential backoff. Permanent failures require a visible failed state and controlled re-run. Duplicate retries must be safe through idempotency.

## Communications Delivery

The communication engine creates a message intent first, then channel deliveries. One communication can have SMS, email, WhatsApp and in-app delivery attempts independently.

## AI Jobs

AI-generated teaching content is always draft content. Store model/provider metadata and source curriculum references where useful. AI failure must never block teachers from using manual workflows.

## OCR Jobs

Uploaded documents are stored first, then OCR/extraction runs asynchronously when practical. Extracted values remain untrusted suggestions until a user verifies them.

## Statutory Jobs

EMIS/AEC readiness calculations can refresh asynchronously, but certification/submission uses deterministic snapshot logic and cannot depend on an unfinished background calculation.

## Observability

Track queue depth, latency, retries, permanent failures and provider-specific failure rates. Alert on sustained job backlog or repeated external-provider outages.
