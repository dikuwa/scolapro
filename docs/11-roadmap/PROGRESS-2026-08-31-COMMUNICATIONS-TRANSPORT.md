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
- Bird SMS webhook verification uses the raw request body, `webhook-id`, `webhook-timestamp`, and `webhook-signature`, with a five-minute timestamp tolerance and support for multiple `v1` signatures during secret rotation.
- Governed communication templates now separate logical ScolaPro templates, approved language/version records, declared variables, and secret-free provider bindings.
- WhatsApp queueing fails closed unless the selected ScolaPro template version is approved and an active approved binding exists for the resolved provider.
- `bird_whatsapp` is available for business-initiated WhatsApp transport using Bird's regional `/v1/whatsapp/messages` API:
  - one E.164 recipient per request
  - approved provider template name/language only; no arbitrary free-form business message
  - ordered text parameters are rendered from governed ScolaPro template variables
  - binding `provider_config.components` may explicitly map `header`, `body`, and `button` components to declared variable keys
  - when no explicit component map is required, declared variables are sent as ordered body parameters
  - stable per-job `Idempotency-Key` prevents blind duplicate sends on retries
- Bird WhatsApp final delivery is projected only from signed terminal webhooks:
  - `whatsapp.delivered` → `delivered`
  - `whatsapp.failed`, `whatsapp.rejected` → `failed`
  - accepted, sent, read, received and unknown events do not rewrite final delivery truth
- Bird WhatsApp webhook receipts keep phone numbers and template values out of diagnostic metadata.

## Required production configuration

- `COMMUNICATIONS_ENABLED=true`
- `INTERNAL_JOB_RUNNER_SECRET`
- `CRON_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- For Resend email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`
- Configure the Resend webhook endpoint to the deployed `/api/webhooks/resend/email` URL and subscribe to required email lifecycle events.
- For Bird SMS: `BIRD_API_BASE_URL`, `BIRD_API_KEY`, `BIRD_SMS_FROM`, `BIRD_SMS_CATEGORY`, `BIRD_WEBHOOK_SECRET`
- Configure the Bird SMS webhook endpoint to the deployed `/api/webhooks/bird/sms` URL and subscribe to SMS lifecycle events.
- Enable Namibia as an SMS destination in the Bird workspace and verify an allowed sender before live traffic.
- For Bird WhatsApp: `BIRD_API_BASE_URL`, `BIRD_API_KEY`, `BIRD_WHATSAPP_WEBHOOK_SECRET`
- Configure a Bird WhatsApp webhook endpoint to deployed `/api/webhooks/bird/whatsapp` and subscribe at minimum to `whatsapp.delivered`, `whatsapp.failed`, and `whatsapp.rejected`.
- Review/approve the required WhatsApp templates in Bird, then bind their exact provider template names/languages to approved ScolaPro template versions before enabling a `bird_whatsapp` provider route.
- Configure `provider_config.components` only when the provider template needs explicit header/body/button variable placement; it remains secret-free routing metadata.

## Still next

1. Provision/test real Resend and Bird credentials outside source control.
2. Run live provider test sends and signed webhook receipts before enabling production communication traffic.
3. Confirm Namibia WhatsApp sender/template onboarding and pricing in the selected Bird workspace before production rollout.
4. Add communications operational UI for route/provider/template health only after live backend transport is verified; never expose credentials.
5. Revisit direct MTC Namibia / Telecom Namibia adapters only if official API onboarding/contracts are obtained; do not guess undocumented payloads.
