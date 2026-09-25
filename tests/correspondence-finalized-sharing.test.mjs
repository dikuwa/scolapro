import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260925133000_correspondence_finalized_sharing.sql");
const actions = read("src/features/correspondence/server/actions.ts");
const editor = read("src/features/correspondence/correspondence-editor.tsx");
const worker = read("src/features/communications/server/process-communication-delivery-queue.ts");
const adapters = read("src/features/communications/server/transport-adapters.ts");

test("finalized correspondence email queues through canonical communications", () => {
  assert.match(migration, /queue_finalized_correspondence_email/);
  assert.match(migration, /communication_messages/);
  assert.match(migration, /communication_recipients/);
  assert.match(migration, /perform public\.queue_communication\(v_message_id\)/);
  assert.match(migration, /domain_type[\s\S]*'correspondence_finalized_pdf'/);
  assert.doesNotMatch(actions, /fetch\("https:\/\/api\.resend\.com/);
});

test("only finalized immutable correspondence can be emailed or device-shared", () => {
  assert.match(migration, /Only finalized correspondence can be emailed/);
  assert.match(migration, /Only finalized correspondence can be shared/);
  assert.match(migration, /app_private\.can_manage_correspondence/);
  assert.match(editor, /readOnly \? <>/);
  assert.match(editor, /Email PDF/);
  assert.match(editor, /Share \/ WhatsApp/);
});

test("email worker materializes the finalized PDF and Resend receives it as an attachment", () => {
  assert.match(worker, /correspondencePdfAttachment/);
  assert.match(worker, /renderCorrespondencePdf/);
  assert.match(worker, /document\.status !== "finalized"/);
  assert.match(worker, /contentBase64: Buffer\.from\(rendered\.bytes\)\.toString\("base64"\)/);
  assert.match(adapters, /attachments: input\.attachments\.map/);
  assert.match(adapters, /content_type: attachment\.contentType/);
});

test("WhatsApp path uses device share/download only and never queues a WhatsApp provider message", () => {
  assert.match(editor, /navigator\.share/);
  assert.match(editor, /download_for_whatsapp/);
  assert.match(editor, /web_share_pdf/);
  assert.doesNotMatch(migration, /'whatsapp'[\s\S]*insert into public\.communication_messages/i);
  assert.doesNotMatch(editor, /bird_whatsapp|api\.whatsapp|wa\.me/);
});

test("send/share audit avoids leaking recipient email into audit metadata", () => {
  assert.match(migration, /'correspondence\.email\.queued'/);
  assert.match(migration, /'correspondence\.shared'/);
  const auditBlock = migration.slice(migration.indexOf("'correspondence.email.queued'"), migration.indexOf("return v_message_id"));
  assert.doesNotMatch(auditBlock, /'destination'/);
});
