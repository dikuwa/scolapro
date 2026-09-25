import "server-only";

import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import {
  OFFICIAL_DOCUMENT_A4_PAGE_RULE,
  OFFICIAL_DOCUMENT_HTML_HEADER_RULE,
  OFFICIAL_DOCUMENT_METADATA_RULE,
  OFFICIAL_DOCUMENT_PRINT_RULE,
} from "@/features/documents/server/official-document-chrome";
import {
  escapeOfficialDocumentHtml,
  renderOfficialDocumentHtmlHeader,
} from "@/features/documents/server/official-document-html-header";
import { renderOfficialDocumentHtmlFooter } from "@/features/documents/server/official-document-html-footer";
import type { VerifiedRoomInventorySheet } from "@/features/room-inventory/server/verified-sheet";

const sourceLabel: Record<VerifiedRoomInventorySheet["custodian"]["source"], string> = {
  manual: "Manual override",
  inherited: "Home room default",
  ambiguous: "Shared home room",
  none: "No custodian",
};

export function renderVerifiedRoomInventoryHtml(input: {
  header: OfficialDocumentHeaderModel;
  sheet: VerifiedRoomInventorySheet;
  verificationUrl: string;
  qrSvg: string;
  generatedAt?: string | null;
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const generatedLabel = new Intl.DateTimeFormat("en-NA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Windhoek",
  }).format(new Date(generatedAt));

  const linkedClasses = input.sheet.linkedClasses.length
    ? input.sheet.linkedClasses.map((item) => item.displayName).join(", ")
    : "None";

  const rows = input.sheet.inventory.map((item, index) => `
    <tr>
      <td class="num">${index + 1}</td>
      <td>${escapeOfficialDocumentHtml(item.itemName)}</td>
      <td>${escapeOfficialDocumentHtml(item.assetNumber || "—")}</td>
      <td>${escapeOfficialDocumentHtml(item.ownership)}</td>
      <td class="num">${item.quantity}</td>
      <td>${escapeOfficialDocumentHtml(item.condition)}</td>
      <td>${escapeOfficialDocumentHtml(item.notes || "—")}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Room Inventory — ${escapeOfficialDocumentHtml(input.sheet.roomDisplayName)}</title>
<style>
  ${OFFICIAL_DOCUMENT_A4_PAGE_RULE}
  :root { --line:#4a4a4a; --muted:#5f5f5f; --tint:#f2f2f2; }
  * { box-sizing:border-box; }
  body { margin:0; padding:10mm 12mm; font-family:Helvetica,Arial,sans-serif; color:#111; background:#fff; }
  .report { width:100%; border:1.2px solid var(--line); padding:7mm 7mm 5mm; min-height:270mm; }
  ${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
  .school-name { margin:0; font-size:18px; text-align:center; }
  .former-name,.school-contact,.emis,.postal { font-size:7px; line-height:1.35; }
  .school-contact span { font-weight:700; }
  .document-title { margin:12px 0 8px; text-align:center; }
  .document-title h2 { margin:0; font-size:15px; letter-spacing:.06em; }
  .document-title p { margin:3px 0 0; font-size:9px; color:var(--muted); }
  .summary { display:grid; grid-template-columns:1fr 1fr; gap:5px 16px; margin:9px 0; padding:8px; border:1px solid var(--line); font-size:8px; }
  .summary strong { display:inline-block; min-width:112px; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:7px; }
  thead { display:table-header-group; }
  th,td { border:1px solid var(--line); padding:4px; vertical-align:top; overflow-wrap:anywhere; }
  th { background:var(--tint); font-weight:700; text-align:left; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .signatures { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:18px; font-size:8px; }
  .signature-box { border-top:1px solid var(--line); padding-top:5px; min-height:34px; }
  .verification { display:grid; grid-template-columns:1fr 92px; gap:12px; align-items:end; margin-top:14px; font-size:8px; }
  .verification svg { width:82px; height:82px; display:block; }
  .verification .ref { font-weight:700; }
  ${OFFICIAL_DOCUMENT_METADATA_RULE}
  @media print {
    body { padding:0; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
    ${OFFICIAL_DOCUMENT_PRINT_RULE}
  }
  @media (max-width:640px) {
    body { padding:12px; }
    .report { padding:14px; }
    .summary,.signatures { grid-template-columns:1fr; }
    .verification { grid-template-columns:1fr; }
  }
</style>
</head>
<body>
<article class="report">
  ${renderOfficialDocumentHtmlHeader(input.header)}
  <section class="document-title">
    <h2>VERIFIED ROOM INVENTORY SHEET</h2>
    <p>${escapeOfficialDocumentHtml(input.sheet.roomDisplayName)}</p>
  </section>

  <section class="summary">
    <div><strong>Room:</strong> ${escapeOfficialDocumentHtml(input.sheet.roomDisplayName)}</div>
    <div><strong>Block / section:</strong> ${escapeOfficialDocumentHtml(input.sheet.blockName || "—")}</div>
    <div><strong>Linked register class:</strong> ${escapeOfficialDocumentHtml(linkedClasses)}</div>
    <div><strong>Responsible custodian:</strong> ${escapeOfficialDocumentHtml(input.sheet.custodian.staffName || "Not assigned")}</div>
    <div><strong>Custodian source:</strong> ${escapeOfficialDocumentHtml(sourceLabel[input.sheet.custodian.source])}</div>
    <div><strong>Verified on:</strong> ${escapeOfficialDocumentHtml(input.sheet.verifiedOn)}</div>
    <div><strong>Verification status:</strong> ${escapeOfficialDocumentHtml(input.sheet.verificationStatus.replaceAll("_", " "))}</div>
    <div><strong>Revision:</strong> ${input.sheet.revision}</div>
  </section>

  <table>
    <colgroup>
      <col style="width:4%" />
      <col style="width:24%" />
      <col style="width:16%" />
      <col style="width:11%" />
      <col style="width:7%" />
      <col style="width:11%" />
      <col style="width:27%" />
    </colgroup>
    <thead>
      <tr><th>#</th><th>Item</th><th>Asset / GRN No.</th><th>Ownership</th><th>Qty</th><th>Condition</th><th>Notes / location</th></tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="7">No inventory items were present in this verified snapshot.</td></tr>'}
    </tbody>
  </table>

  <p style="font-size:8px;margin:7px 0 0"><strong>Item-line total:</strong> ${input.sheet.verifiedItemCount}</p>
  ${input.sheet.verificationNotes ? `<p style="font-size:8px"><strong>Verification note:</strong> ${escapeOfficialDocumentHtml(input.sheet.verificationNotes)}</p>` : ""}

  <section class="signatures">
    <div class="signature-box">Responsible staff signature / date</div>
    <div class="signature-box">Management verification / date</div>
  </section>

  <section class="verification">
    <div>
      <div class="ref">ScolaPro reference: ${escapeOfficialDocumentHtml(input.sheet.scolaproReference)}</div>
      <div>Verify this finalized record at ${escapeOfficialDocumentHtml(input.verificationUrl)}</div>
      <div>Generated: ${escapeOfficialDocumentHtml(generatedLabel)}</div>
    </div>
    <div>${input.qrSvg}</div>
  </section>

  ${renderOfficialDocumentHtmlFooter({
    left: `ScolaPro verified room inventory · ${input.sheet.scolaproReference}`,
    right: "Page 1",
  })}
</article>
<script>if (new URLSearchParams(location.search).get("print") === "1") window.addEventListener("load", () => window.print());</script>
</body>
</html>`;
}
