import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260925120000_room_inventory_verified_sheet.sql");
const route = read("src/app/api/official-documents/room-inventory/route.ts");
const query = read("src/features/room-inventory/server/verified-sheet.ts");
const html = read("src/features/room-inventory/server/render-verified-sheet-html.ts");
const pdf = read("src/features/room-inventory/server/render-verified-sheet-pdf.ts");
const workspace = read("src/features/room-inventory/room-inventory-workspace.tsx");

test("room verification freezes export-required inventory and responsibility data", () => {
  assert.match(migration, /'notes', i\.notes/);
  assert.match(migration, /room_display_name_snapshot/);
  assert.match(migration, /linked_classes_snapshot/);
  assert.match(migration, /custodian_snapshot/);
  assert.match(migration, /app_private\.resolve_room_custodian_core/);
});

test("room verification registers one official verification revision at finalization time", () => {
  assert.match(migration, /'room_inventory_a4_sheet'/);
  assert.match(migration, /app_private\.register_official_document_verification/);
  assert.match(migration, /source_lineage_id = v_room\.id/);
  assert.match(migration, /source_record_id = v_verification\.id/);
});

test("verified room inventory export is read-only and current-school scoped", () => {
  assert.match(route, /\.eq\("school_id", membership\.schoolId\)/);
  assert.match(route, /getVerifiedRoomInventorySheet\(roomId\)/);
  assert.doesNotMatch(route, /verify_room_inventory|insert\(|update\(|delete\(/);
  assert.match(query, /rpc\("get_verified_room_inventory_sheet"/);
});

test("A4 room inventory output contains required identity, table, signatures, QR and page numbering", () => {
  for (const token of [
    "VERIFIED ROOM INVENTORY SHEET",
    "Asset / GRN No.",
    "Ownership",
    "Condition",
    "Notes / location",
    "Responsible staff signature / date",
    "Management verification / date",
    "ScolaPro reference",
  ]) assert.ok(html.includes(token), "missing " + token);
  assert.match(html, /OFFICIAL_DOCUMENT_A4_PAGE_RULE/);
  assert.match(html, /OFFICIAL_DOCUMENT_PRINT_RULE/);
  assert.match(pdf, /drawOfficialDocumentPdfHeader/);
  assert.match(pdf, /drawOfficialDocumentPdfFooter/);
  assert.match(pdf, /pageCount: pages\.length/);
  assert.match(pdf, /QRCode\.toDataURL/);
});

test("room inventory workspace exposes Preview Print PDF only after verification exists", () => {
  assert.match(workspace, /room\.lastVerified \? \(/);
  assert.match(workspace, /Preview sheet/);
  assert.match(workspace, />Print</);
  assert.match(workspace, />PDF</);
});
