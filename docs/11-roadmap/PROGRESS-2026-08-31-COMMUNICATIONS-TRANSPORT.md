# Communications transport progress — 2026-08-31

## Completed

- Provider API acceptance is distinct from final recipient delivery truth.
- Delivery receipts are append-only and idempotent by provider event ID.
- `COMMUNICATIONS_ENABLED=false` prevents the worker from claiming or sending jobs.
- Internal worker route follows the established ScolaPro `INTERNAL_JOB_RUNNER_SECRET` / `CRON_SECRET` pattern.
- Provider credentials remain server-only and outside PostgreSQL.
- `resend_email` is available for email transport.
- Resend email final delivery is projected only from signed terminal webhooks:
  - `email.delivered` → `delivered`
  - `email.bounced`, `email.failed`, `email.suppressed` → `failed`
  - sent, delayed, opened, clicked, complained and unknown events do not rewrite final delivery truth
- Resend webhook verification uses the raw request body plus `svix-id`, `svix-timestamp`, and `svix-signature`, with a five-minute replay window and provider-event deduplication.
- `bird_sms` is available for SMS transport using Bird's regional `/v1/sms/messages` API.
- Bird SMS final delivery is projected only from signed terminal webhooks:
  - `sms.delivered` → `delivered`
  - `sms.undelivered`, `sms.failed`, `sms.expired`, `sms.rejected` → `failed`
  - non-terminal and unknown events are acknowledged without changing canonical delivery state
- Bird webhook verification uses the raw request body, `webhook-id`, `webhook-timestamp`, and `webhook-signature`, with a five-minute timestamp tolerance and support for multiple `v1` signatures during secret rotation.

## Required production configuration

- `COMMUNICATIONS_ENABLED=true`
- `INTERNAL_JOB_RUNNER_SECRET`
- `CRON_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- For Resend email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`
- Configure the Resend webhook endpoint to the deployed `/api/webhooks/resend/email` URL and subscribe to required email lifecycle events.
- For Bird SMS: `BIRD_API_BASE_URL`, `BIRD_API_KEY`, `BIRD_SMS_FROM`, `BIRD_SMS_CATEGORY`, `BIRD_WEBHOOK_SECRET`
- Configure the Bird webhook endpoint to the deployed `/api/webhooks/bird/sms` URL and subscribe to SMS lifecycle events.
- Enable Namibia as an SMS destination in the Bird workspace and verify an allowed sender before live traffic.

## Still next

1. Provision/test real Resend and Bird credentials outside source control.
2. Run live provider test sends and signed webhook receipts before enabling production communication traffic.
3. Add communications operational UI for route/provider health only after backend transport is verified; do not expose credentials.
4. Add WhatsApp only after ScolaPro has a governed approved-template + variable model. Do not send arbitrary free-form business-initiated WhatsApp content.
5. Revisit direct MTC Namibia / Telecom Namibia adapters only if official API onboarding/contracts are obtained; do not guess undocumented payloads.
