import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire("node:assert/strict");
const fs = nodeRequire("node:fs");
const path = nodeRequire("node:path");
const { test } = nodeRequire("node:test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const worker = source("src/features/communications/server/process-communication-delivery-queue.ts");
const adapters = source("src/features/communications/server/transport-adapters.ts");
const deliveryRoute = source("src/app/api/internal/communications-delivery/route.ts");
const receiptRoute = source("src/app/api/internal/communications-receipts/route.ts");
const birdSmsRoute = source("src/app/api/webhooks/bird/sms/route.ts");
const birdWhatsAppRoute = source("src/app/api/webhooks/bird/whatsapp/route.ts");
const resendRoute = source("src/app/api/webhooks/resend/email/route.ts");
const birdSmsWebhook = source("src/features/communications/server/bird-sms-webhook.ts");
const birdWhatsAppWebhook = source("src/features/communications/server/bird-whatsapp-webhook.ts");
const resendWebhook = source("src/features/communications/server/resend-email-webhook.ts");
const currentSchoolBoundary = source("supabase/migrations/20260912103100_communication_current_school_boundary.sql");
const hardening = source("supabase/migrations/20260919083000_communications_current_scope_privacy_hardening.sql");

test("delivery worker remains feature-gated and provider-neutral", () => {
  assert.match(worker, /COMMUNICATIONS_ENABLED/);
  assert.match(worker, /claim_communication_delivery_jobs/);
  assert.match(worker, /resolveCommunicationTransportAdapter/);
  assert.match(worker, /complete_communication_delivery_job/);
  assert.match(worker, /fail_communication_delivery_job/);
  assert.match(adapters, /Idempotency-Key/);
  assert.match(adapters, /resend_email/);
  assert.match(adapters, /bird_sms/);
  assert.match(adapters, /bird_whatsapp/);
});

test("internal worker and receipt ingress require server-side bearer secrets", () => {
  assert.match(deliveryRoute, /INTERNAL_JOB_RUNNER_SECRET/);
  assert.match(deliveryRoute, /CRON_SECRET/);
  assert.match(receiptRoute, /COMMUNICATION_RECEIPT_INGEST_SECRET/);
  assert.match(deliveryRoute, /status: 401/);
  assert.match(receiptRoute, /status: 401/);
});

test("provider webhooks authenticate the raw body before service-role receipt projection", () => {
  for (const route of [birdSmsRoute, birdWhatsAppRoute, resendRoute]) {
    assert.match(route, /await request\.text\(\)/);
    assert.match(route, /verify.*Webhook.*Signature/);
    assert.match(route, /record_communication_delivery_receipt/);
  }
  assert.match(birdSmsWebhook, /BIRD_WEBHOOK_TOLERANCE_SECONDS = 300/);
  assert.match(birdWhatsAppWebhook, /BIRD_WEBHOOK_TOLERANCE_SECONDS = 300/);
  assert.match(resendWebhook, /RESEND_WEBHOOK_TOLERANCE_SECONDS = 300/);
});

test("webhook terminal mappings preserve provider acceptance versus final delivery truth", () => {
  assert.match(birdSmsWebhook, /sms\.delivered/);
  assert.match(birdSmsWebhook, /sms\.undelivered/);
  assert.match(birdWhatsAppWebhook, /whatsapp\.delivered/);
  assert.match(birdWhatsAppWebhook, /whatsapp\.failed/);
  assert.match(resendWebhook, /email\.delivered/);
  assert.match(resendWebhook, /email\.bounced/);
  assert.match(resendWebhook, /email\.suppressed/);
});

test("provider rejection errors cannot echo provider response content into generic logs", () => {
  assert.doesNotMatch(adapters, /Resend rejected email submission: \$\{detail\}/);
  assert.doesNotMatch(adapters, /Bird rejected SMS submission: \$\{birdErrorDetail/);
  assert.doesNotMatch(adapters, /Bird rejected WhatsApp submission: \$\{birdErrorDetail/);
  assert.match(adapters, /Resend rejected email submission \(HTTP \$\{response\.status\}\)/);
  assert.match(adapters, /Bird rejected SMS submission \(HTTP \$\{response\.status\}\)/);
  assert.match(adapters, /Bird rejected WhatsApp submission \(HTTP \$\{response\.status\}\)/);
  assert.doesNotMatch(worker, /console\.error\("communication delivery job failed", job\.id, message\)/);
  assert.doesNotMatch(deliveryRoute, /communication delivery worker failed", message/);
});

test("communications hardening enforces deterministic current-school and Platform Support separation", () => {
  assert.match(hardening, /is_current_school/);
  assert.match(currentSchoolBoundary, /order by sm\.active_from desc, sm\.id asc/);
  assert.match(hardening, /platform_support/);
  assert.match(hardening, /can_author_communications/);
  assert.match(hardening, /can_read_communication/);
  assert.match(hardening, /set_communication_provider_route/);
  assert.match(hardening, /list_communication_delivery_diagnostics/);
});

test("recipient-visible delivery errors stay generic while raw diagnostics remain protected", () => {
  assert.match(hardening, /failure_reason=case when v_dead then 'Provider delivery failed' else null end/);
  assert.match(hardening, /else 'Provider reported delivery failure'/);
  assert.match(hardening, /last_error=left\(coalesce\(p_error/);
  assert.match(hardening, /error_detail=left\(coalesce\(p_error/);
});

test("provider webhook diagnostics do not capture destinations, credentials or message bodies", () => {
  assert.doesNotMatch(birdSmsWebhook, /phone_number|destination|message_body|authorization|api[_-]?key/i);
  assert.doesNotMatch(birdWhatsAppWebhook, /phone_number|destination|template_parameters|message_body|authorization|api[_-]?key/i);
  assert.doesNotMatch(resendWebhook, /destination|subject_line|message_body|authorization|api[_-]?key/i);
  assert.match(receiptRoute, /secretKeyPattern/);
  assert.match(receiptRoute, /providerMetadata exceeds 16 KB/);
});
