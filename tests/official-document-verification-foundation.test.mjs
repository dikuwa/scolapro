import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260924090000_official_document_verification_foundation.sql');
const qrAdapter = read('src/features/documents/server/official-document-verification.ts');
const publicQuery = read('src/features/documents/server/public-document-verification.ts');
const verificationPage = read('src/app/verify/[token]/page.tsx');
const payloadModule = await import('../src/features/documents/official-document-verification-payload.ts');

test('verification tokens have 192 bits of entropy and are resolved by hash', () => {
  assert.match(migration, /extensions\.gen_random_bytes\(24\)/);
  assert.match(migration, /verification_token ~ '\^\[A-Za-z0-9_-\]\{32\}\$'/);
  assert.match(migration, /token_hash = extensions\.digest\(p_token, 'sha256'\)/);
  assert.match(migration, /unique check \(octet_length\(token_hash\) = 32\)/);
});

test('the QR payload accepts only an opaque token and contains no private identifier', () => {
  const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  const payload = payloadModule.buildOfficialDocumentVerificationPayload({
    token,
    origin: 'https://school.example/private?source=discarded',
  });

  assert.equal(payload, `https://school.example/verify/${token}`);
  assert.doesNotMatch(payload, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.throws(
    () => payloadModule.buildOfficialDocumentVerificationPayload({ token: 'private-record-id', origin: 'https://school.example' }),
    /Invalid official-document verification token/,
  );
  assert.match(qrAdapter, /QRCode\.toString\(payload/);
  assert.doesNotMatch(qrAdapter, /sourceRecordId|tenantId|schoolId|storageUrl|documentBody/);
});

test('registration is finalization-only and inaccessible to application roles', () => {
  assert.match(migration, /Draft or non-finalized documents cannot be registered for public verification/);
  assert.match(migration, /p_finalized_at is null/);
  assert.match(
    migration,
    /revoke all on function app_private\.register_official_document_verification\([\s\S]*?from public, anon, authenticated/,
  );
  assert.match(migration, /Official document tenant and school scope do not match/);
});

test('superseded and revoked revisions remain explicit, independently resolvable states', () => {
  assert.match(migration, /status in \('valid', 'superseded', 'revoked'\)/);
  assert.match(migration, /set status = 'superseded'/);
  assert.match(migration, /set status = 'revoked'/);
  assert.match(migration, /and odv\.token_hash = extensions\.digest\(p_token, 'sha256'\)/);
  assert.match(verificationPage, /This finalized revision remains authentic, but a newer revision has superseded it/);
  assert.match(verificationPage, /Do not treat this revision as currently valid/);
});

test('the public resolver and page expose only minimal provenance', () => {
  const returnBlock = migration.match(/create or replace function public\.resolve_official_document_verification[\s\S]*?language sql/)?.[0];
  assert.ok(returnBlock);
  for (const field of [
    'school_name text',
    'document_type text',
    'scolapro_reference text',
    'issued_on date',
    'validity_status text',
    'revision integer',
    'confirmation text',
  ]) assert.match(returnBlock, new RegExp(field));
  for (const privateField of ['tenant_id', 'school_id', 'source_record_id', 'source_lineage_id', 'verification_token']) {
    assert.doesNotMatch(returnBlock, new RegExp(privateField));
  }
  assert.doesNotMatch(publicQuery, /source_record|source_lineage|storage_url|document_body|learner/);
  assert.doesNotMatch(verificationPage, /sourceRecord|sourceLineage|storageUrl|documentBody|learner/i);
});

test('only future attendance summary and room inventory consumers are registered', () => {
  assert.match(migration, /'official_attendance_summary', 'Official Attendance Summary', 'ATT'/);
  assert.match(migration, /'room_inventory_a4_sheet', 'Room Inventory A4 Sheet', 'ROOM'/);
  assert.doesNotMatch(migration, /correspondence_documents|report_card_snapshots/);
});
