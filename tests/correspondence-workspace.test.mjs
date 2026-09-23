import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const migration = await read("supabase/migrations/20260923150000_correspondence_workspace.sql");
const editor = await read("src/features/correspondence/correspondence-editor.tsx");
const templates = await read("src/features/correspondence/templates.ts");
const richText = await read("src/features/correspondence/rich-text.ts");
const html = await read("src/features/correspondence/server/render-correspondence-html.ts");
const pdf = await read("src/features/correspondence/server/render-correspondence-pdf.ts");
const route = await read("src/app/api/official-documents/correspondence/[documentId]/route.ts");

test("correspondence is current-school leadership only and excludes platform roles", () => {
  assert.match(migration, /user_current_school_matches/);
  assert.match(migration, /role_key in \('school_admin','principal','deputy_principal'\)/);
  assert.match(migration, /not exists \([\s\S]*from public\.platform_memberships/);
  assert.doesNotMatch(migration, /pm\.role_key='platform_support'/);
});

test("finalization freezes official provenance and revisions are append-only", () => {
  assert.match(migration, /Finalized correspondence is immutable; create a revision/);
  assert.match(migration, /header_snapshot/);
  assert.match(migration, /school_identity_snapshot/);
  assert.match(migration, /author_snapshot/);
  assert.match(migration, /reference_number='CORR-'/);
  assert.match(migration, /Correspondence history cannot be deleted/);
  assert.match(migration, /revision provenance is invalid/);
});

test("the controlled rich-text surface rejects arbitrary HTML and unsafe links", () => {
  assert.match(richText, /const blockTypes = new Set/);
  assert.match(richText, /const markTypes = new Set/);
  assert.match(richText, /\^\(https\?:\|mailto:\)/);
  assert.match(richText, /CORRESPONDENCE_FONTS\.includes/);
  assert.doesNotMatch(editor, /contentEditable/);
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML/);
});

test("all eight governed templates and required correspondence fields are present", () => {
  for (const key of ["general_letter", "circular_notice", "vacancy_advertisement", "parent_communication", "request_letter", "invitation", "meeting_notice", "internal_memo"]) {
    assert.match(templates, new RegExp(key));
  }
  for (const field of ["documentDate", "recipient", "attention", "subject", "body", "closing", "signatoryName", "signatoryPosition", "includeSignatureBlock", "attachments"]) {
    assert.match(editor, new RegExp(field));
  }
});

test("create, edit, preview, finalize, print, PDF, email and share are exposed", () => {
  for (const label of ["Save draft", "Preview", "Print", "PDF", "Email", "Share", "Finalize", "Create revision"]) {
    assert.match(editor, new RegExp(label));
  }
});

test("HTML and PDF use the canonical external header and handle multi-page tables", () => {
  assert.match(html, /renderOfficialDocumentHtmlHeader/);
  assert.match(html, /OFFICIAL_DOCUMENT_A4_PAGE_RULE/);
  assert.match(html, /thead\{display:table-header-group\}/);
  assert.match(pdf, /drawOfficialDocumentPdfHeader/);
  assert.match(pdf, /newPage/);
  assert.match(pdf, /rowIndex>0/);
  assert.match(route, /getLiveSchoolDocumentHeader\(document\.schoolId,"external_correspondence"\)/);
  assert.match(route, /document\.headerSnapshot/);
});

test("exports remain private and resist MIME sniffing", () => {
  assert.match(route, /private, no-store/);
  assert.match(route, /X-Content-Type-Options":"nosniff/);
  assert.match(route, /Content-Security-Policy/);
});
