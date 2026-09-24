import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260924130000_official_attendance_summary_finalization.sql", "utf8");
const route = readFileSync("src/app/api/official-documents/attendance-summary/route.ts", "utf8");
const pdfRenderer = readFileSync("src/features/documents/server/render-official-attendance-summary-pdf.ts", "utf8");
const actions = readFileSync("src/features/attendance/server/actions.ts", "utf8");
const verifyFoundation = readFileSync("supabase/migrations/20260924090000_official_document_verification_foundation.sql", "utf8");
const page = readFileSync("src/app/attendance/page.tsx", "utf8");

test("finalization is gated to Principal / Deputy Principal / School Admin authority", () => {
  assert.match(migration, /has_school_role\(p_school_id, array\['principal', 'deputy_principal', 'school_admin'\]\)/);
  assert.match(migration, /Only the Principal, Deputy Principal or School Admin may finalize/);
  // HOD is intentionally excluded from the finalize authority set.
  assert.doesNotMatch(migration, /array\['principal', 'deputy_principal', 'school_admin', 'hod'\]/);
});

test("finalization is gated on register readiness, recomputed server-side", () => {
  assert.match(migration, /official_attendance_summary_is_ready/);
  assert.match(migration, /if not app_private\.official_attendance_summary_is_ready\(/);
  assert.match(migration, /cannot be finalized until all expected registers are confirmed/);
});

test("finalization mints an opaque public verification through the #707 foundation", () => {
  assert.match(migration, /register_official_document_verification\(/);
  assert.match(migration, /'official_attendance_summary', v_snapshot_id, v_lineage/);
});

test("finalized snapshots are immutable: no draft state can be created or leaked", () => {
  assert.match(migration, /status text not null default 'finalized' check \(status in \('finalized', 'superseded', 'revoked'\)\)/);
  // No draft status exists; only finalized/superseded/revoked.
  assert.doesNotMatch(migration, /'draft'/);
  // Application roles cannot write; inserts happen only through the security-definer RPC.
  assert.match(migration, /revoke all on public\.official_attendance_summary_snapshots from public, anon/);
  assert.match(migration, /grant select on public\.official_attendance_summary_snapshots to authenticated/);
  assert.doesNotMatch(migration, /for insert to authenticated/);
});

test("a new finalization of the same scope supersedes the prior revision", () => {
  assert.match(migration, /v_revision := v_existing_revision \+ 1/);
  assert.match(migration, /source_lineage_id, revision\)/);
  assert.match(migration, /set status = 'superseded'\s*where id = v_supersedes_snapshot_id/);
});

test("the export route is a node runtime, dynamic, and never caches or leaks drafts", () => {
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /Cache-Control": "private, no-store, max-age=0"/);
  // A non-finalized summary is never exportable.
  assert.match(route, /if \(!finalization\)/);
  assert.match(route, /status: 404/);
});

test("the export route produces a real PDF (pdf-lib) and a real XLSX workbook (xlsx), plus an HTML preview", () => {
  assert.match(route, /renderOfficialAttendanceSummaryPdf/);
  assert.match(pdfRenderer, /from "pdf-lib"/);
  assert.match(pdfRenderer, /PDFDocument\.create\(\)/);
  assert.match(route, /XLSX\.utils\.book_append_sheet/);
  assert.match(route, /XLSX\.write\(workbook, \{ type: "array", bookType: "xlsx"/);
  assert.match(route, /renderOfficialAttendanceSummaryHtml/);
  assert.match(route, /url\.searchParams\.get\("format"\) === "pdf" \? "pdf" : url\.searchParams\.get\("format"\) === "xlsx" \? "xlsx" : "html"/);
});

test("the export route embeds an opaque verification QR tied to the frozen snapshot", () => {
  assert.match(route, /renderOfficialDocumentVerificationQrSvg/);
  assert.match(route, /verificationUrl/);
});

test("the finalize server action recomputes the authoritative summary and re-checks readiness", () => {
  assert.match(actions, /export async function finalizeOfficialAttendanceSummary/);
  assert.match(actions, /getOfficialAttendanceSummary\(/);
  assert.match(actions, /if \(!summary\.readiness\.complete\)/);
  assert.match(actions, /FINALIZE_AUTHORIZED_ROLES/);
  assert.match(actions, /Only the Principal, Deputy Principal or School Admin may finalize/);
});

test("the public verification resolver returns only minimal provenance (no learner, source or school identifiers)", () => {
  const resolverMatch = verifyFoundation.match(/create or replace function public\.resolve_official_document_verification[\s\S]*?\$\$;/);
  assert.ok(resolverMatch, "public resolver function must exist");
  const resolver = resolverMatch[0];
  assert.match(resolver, /odv\.school_name_snapshot/);
  assert.match(resolver, /odv\.document_type_label/);
  assert.match(resolver, /odv\.scolapro_reference/);
  // The minimal public projection must NOT surface internal identifiers.
  assert.doesNotMatch(resolver, /odv\.source_record_id/);
  assert.doesNotMatch(resolver, /odv\.source_lineage_id/);
  assert.doesNotMatch(resolver, /odv\.tenant_id/);
  assert.doesNotMatch(resolver, /odv\.school_id/);
  assert.doesNotMatch(resolver, /odv\.verification_token/);
});

test("term mode is wired into the official attendance view", () => {
  assert.match(page, /requestedMode/);
  assert.match(page, /mode: "week" \| "term" = requestedMode === "term" \? "term" : "week"/);
  assert.match(page, /getOfficialAttendanceSummary\(schoolId, academicYear, mode, date/);
  assert.match(page, /getOfficialAttendanceSummaryFinalization\(/);
});
