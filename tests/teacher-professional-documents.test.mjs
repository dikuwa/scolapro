import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire("node:assert/strict");
const fs = nodeRequire("node:fs");
const path = nodeRequire("node:path");
const { test } = nodeRequire("node:test");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const actions = source("src/features/teaching/server/professional-documents.ts");
const queries = source("src/features/teaching/server/file-queries.ts");
const route = source("src/app/api/teaching/files/[documentId]/route.ts");
const page = source("src/app/teaching/files/page.tsx");
const workspace = source("src/features/teaching/components/teaching-files.tsx");
const migration = source("supabase/migrations/20260918210000_teacher_professional_documents.sql");
const dbTest = source("supabase/tests/teacher_professional_documents_test.sql");

test("professional document foundation is singular, private and signed-access based", () => {
  assert.match(migration, /create table if not exists public\.teacher_professional_documents/);
  assert.equal((migration.match(/create table if not exists public\.teacher_professional_documents/g) || []).length, 1);
  assert.match(migration, /'teacher-professional-documents'/);
  assert.match(migration, /false,\s*10485760/);
  assert.doesNotMatch(migration, /create policy[\s\S]{0,180}teacher-professional-documents[\s\S]{0,180}storage\.objects/i);
  assert.match(actions, /createSignedUploadUrl/);
  assert.match(route, /createSignedUrl/);
});

test("teacher ownership is current-school/effective-placement bound and platform roles are denied", () => {
  assert.match(migration, /user_targets_current_school/);
  assert.match(migration, /staff_member_covers_school_period/);
  assert.match(migration, /role_key in \('teacher','class_teacher','hod'\)/);
  assert.match(migration, /platform_admin','platform_support/);
  assert.match(actions, /context\.platformMemberships\.length/);
  assert.match(dbTest, /Platform Support is denied teacher-owned upload authority/);
  assert.match(dbTest, /ended effective placement cannot prepare professional document upload/);
  assert.match(dbTest, /teacher cannot cross into another school/);
  assert.match(dbTest, /teacher cannot cross tenant through a foreign school/);
});

test("HOD access is owner-only rather than broad cross-teacher browsing", () => {
  assert.match(migration, /owner_staff_member_id/);
  assert.match(migration, /teachers read own professional documents/);
  assert.match(dbTest, /HOD role alone does not grant cross-teacher professional document browsing/);
  assert.doesNotMatch(migration, /hod[^\n]{0,120}(select|read)[^\n]{0,120}all/i);
});

test("archive preserves immutable document identity and audit provenance", () => {
  assert.match(migration, /Teacher professional documents are archived, not deleted/);
  assert.match(migration, /identity and upload provenance are immutable/);
  assert.match(migration, /teacher_professional_document\.uploaded/);
  assert.match(migration, /teacher_professional_document\.archived/);
  assert.match(dbTest, /archive preserves the row and records the actor/);
  assert.match(dbTest, /document ownership\/provenance cannot be rewritten/);
});

test("categories stay neutral and official taxonomy remains source-gated", () => {
  assert.match(queries, /OFFICIAL_TEACHER_FILE_TAXONOMY_SOURCED = false/);
  assert.match(workspace, /Optional neutral label/);
  assert.match(workspace, /does not represent an official requirement/);
  assert.match(workspace, /no Ministry\/NIED table of contents has been invented/i);
  assert.doesNotMatch(workspace, /NIED required/i);
});

test("teaching files keeps existing connected records and adds owner uploads without replacing them", () => {
  assert.match(queries, /teacher_allocations/);
  assert.match(queries, /lesson_preparations/);
  assert.match(queries, /\/api\/official-documents\/class-list/);
  assert.match(queries, /teacher_professional_documents/);
  assert.match(workspace, /Official documents/);
  assert.match(workspace, /Your teaching records/);
  assert.match(workspace, /My uploaded professional documents/);
  assert.match(page, /ownerMembership/);
});

test("permanent deletion is archive-gated, review-retained, FK-blocked and storage-server-side", () => {
  const migration = source("supabase/migrations/20260923143000_teacher_professional_document_permanent_delete.sql");
  const policy = source("src/features/teaching/professional-document-policy.ts");
  assert.match(migration, /Archive this document before deleting it permanently/);
  assert.match(migration, /entered HOD review/);
  assert.match(migration, /Teacher professional documents are archived, not deleted/);
  assert.match(policy, /PROFESSIONAL_DOCUMENT_ARCHIVE_FIRST_MESSAGE/);
  assert.match(policy, /PROFESSIONAL_DOCUMENT_GOVERNED_REFERENCE_MESSAGE/);
  assert.match(actions, /PROFESSIONAL_DOCUMENT_ARCHIVE_FIRST_MESSAGE/);
  assert.match(actions, /createSupabaseAdminClient\(\)\.storage/);
  assert.match(actions, /\.remove\(\[document\.storage_path\]\)/);
  assert.doesNotMatch(migration, /create policy[^;]{0,300}teacher-professional-documents[^;]{0,300}delete/i);
  assert.doesNotMatch(migration, /offline|queue|retention|retention_period|retain_for|interval '\d/i);
  assert.match(queries, /canPermanentlyDelete = archived && !review/);
  assert.match(workspace, /PROFESSIONAL_DOCUMENT_ARCHIVE_FIRST_MESSAGE/);
  assert.match(workspace, /Delete permanently/);
  assert.match(workspace, /data-confirm-destructive/);
  assert.match(workspace, /disabled=\{permanentDeleteDisabled\}/);
});

test("upload MIME normalization stays consistent across prepare, browser content type and finalize", () => {
  const policy = source("src/features/teaching/professional-document-policy.ts");
  assert.match(policy, /resolveTeacherProfessionalDocumentMimeType/);
  assert.match(policy, /EXTENSION_MIME_TYPES/);
  assert.match(workspace, /resolveTeacherProfessionalDocumentMimeType/);
  assert.match(workspace, /teacherProfessionalDocumentUploadIssue/);
  assert.match(workspace, /contentType: ticket\.mimeType/);
  assert.match(workspace, /accept=\{TEACHER_PROFESSIONAL_DOCUMENT_ACCEPT\}/);
  assert.match(workspace, /setSelectedFile/);
  assert.match(actions, /createSignedUploadUrl/);
});

test("download route authorizes through RLS before minting a short-lived signed URL", () => {
  const selectIndex = route.indexOf('.from("teacher_professional_documents")');
  const signIndex = route.indexOf(".createSignedUrl(");
  assert.ok(selectIndex >= 0 && signIndex > selectIndex);
  assert.match(route, /60,/);
  assert.match(route, /document\.original_filename/);
});
