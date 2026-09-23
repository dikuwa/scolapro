import "server-only";

import { OFFICIAL_DOCUMENT_A4_PAGE_RULE, OFFICIAL_DOCUMENT_HTML_HEADER_RULE, OFFICIAL_DOCUMENT_PRINT_RULE } from "@/features/documents/server/official-document-chrome";
import { escapeOfficialDocumentHtml, renderOfficialDocumentHtmlHeader } from "@/features/documents/server/official-document-html-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { renderCorrespondenceBodyHtml } from "@/features/correspondence/rich-text";
import type { CorrespondenceDocument } from "@/features/correspondence/types";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "long", year: "numeric", timeZone: "Africa/Windhoek" }).format(new Date(`${value}T12:00:00+02:00`));
}

export function renderCorrespondenceHtml(input: { document: CorrespondenceDocument; header: OfficialDocumentHeaderModel; printImmediately?: boolean; logoBytes?: Uint8Array | null }) {
  const { document, header } = input;
  const attachments = document.attachments.length ? `<section class="attachments"><strong>Attachments:</strong><ol>${document.attachments.map((item) => `<li>${escapeOfficialDocumentHtml(item)}</li>`).join("")}</ol></section>` : "";
  const author = document.authorSnapshot?.displayName ?? "Draft author";
  const finalized = document.status === "finalized";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeOfficialDocumentHtml(document.subject || "Official correspondence")}</title><style>
  :root{--ink:#1d2330;--muted:#5f6673;--line:#777;--paper:#fff;--screen:#eef0f4;}
  *{box-sizing:border-box} ${OFFICIAL_DOCUMENT_A4_PAGE_RULE}
  body{margin:0;background:var(--screen);color:var(--ink);font-family:Aptos,Arial,sans-serif;font-size:11pt;line-height:1.55}
  .screen-actions{position:sticky;top:0;z-index:2;display:flex;justify-content:center;gap:8px;padding:10px;background:rgba(238,240,244,.96);border-bottom:1px solid #d7dae0}
  .screen-actions button{border:1px solid #c8ccd5;border-radius:8px;background:#fff;padding:8px 14px;font:600 13px Aptos,Arial,sans-serif;cursor:pointer}
  .report{width:210mm;min-height:297mm;margin:18px auto;background:var(--paper);padding:10mm 12mm 14mm;box-shadow:0 8px 28px rgba(29,35,48,.12)}
  ${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
  .school-header{border-width:0 0 1px;padding:0 4px 10px}.school-name{margin:0;font-size:19px}.former-name,.school-contact,.emis,.postal{font-size:7px;line-height:1.35}
  .document-meta{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:8mm;font-size:9pt}.document-meta strong{font-weight:650}.reference{text-align:right}
  .recipient{margin-top:7mm}.recipient p{margin:0 0 2px}.subject{margin-top:6mm;font-weight:700;text-transform:uppercase;text-decoration:underline;text-underline-offset:3px}
  .body{margin-top:5mm}.body p{margin:0 0 4mm}.body h2{margin:6mm 0 2mm;font-size:16pt}.body h3{margin:5mm 0 2mm;font-size:14pt}.body ul,.body ol{margin:2mm 0 4mm 7mm}.body a{color:inherit;text-decoration:underline}.body blockquote{border-left:2px solid var(--line);margin:4mm 0;padding-left:4mm;color:var(--muted)}
  table{width:100%;border-collapse:collapse;margin:4mm 0;font-size:9pt;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid var(--line);padding:2mm;vertical-align:top;overflow-wrap:anywhere}th{font-weight:700;background:#f1f2f4}tr{break-inside:avoid;page-break-inside:avoid}
  .signature{margin-top:10mm;break-inside:avoid}.signature-space{height:17mm;border-bottom:1px solid var(--line);width:62mm}.signature p{margin:2px 0}.attachments{margin-top:7mm;font-size:9pt;break-inside:avoid}.attachments ol{margin:2mm 0 0 7mm}
  .provenance{margin-top:10mm;border-top:1px solid #bbb;padding-top:2mm;font-size:6.5pt;color:var(--muted);display:flex;justify-content:space-between;gap:8px}.draft{margin:4mm 0 -2mm;text-align:center;color:#915c17;font-size:8pt;font-weight:700;letter-spacing:.08em}
  @media(max-width:760px){.report{width:100%;min-height:0;margin:0;padding:16px;box-shadow:none}.document-meta{grid-template-columns:1fr}.reference{text-align:left}}
  @media print{body{background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}.screen-actions{display:none}.report{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}${OFFICIAL_DOCUMENT_PRINT_RULE}.school-header{break-inside:avoid}.provenance{break-inside:avoid}}
  </style></head><body><div class="screen-actions"><button onclick="window.print()">Print document</button></div><main class="report">
  ${renderOfficialDocumentHtmlHeader(header,input.logoBytes)}
  ${finalized ? "" : '<div class="draft">DRAFT — NOT FINAL</div>'}
  <section class="document-meta"><div><strong>Date:</strong> ${escapeOfficialDocumentHtml(dateLabel(document.documentDate))}</div><div class="reference"><strong>Reference:</strong> ${escapeOfficialDocumentHtml(document.referenceNumber ?? "Assigned on finalization")}</div></section>
  <section class="recipient"><p><strong>To:</strong> ${escapeOfficialDocumentHtml(document.recipient || "—")}</p>${document.attention ? `<p><strong>Attention:</strong> ${escapeOfficialDocumentHtml(document.attention)}</p>` : ""}</section>
  <div class="subject">Re: ${escapeOfficialDocumentHtml(document.subject || "Untitled correspondence")}</div>
  <article class="body">${renderCorrespondenceBodyHtml(document.body)}</article>
  <section class="signature"><p>${escapeOfficialDocumentHtml(document.closing)}</p>${document.includeSignatureBlock ? '<div class="signature-space"></div>' : ""}<p><strong>${escapeOfficialDocumentHtml(document.signatoryName)}</strong></p><p>${escapeOfficialDocumentHtml(document.signatoryPosition)}</p></section>
  ${attachments}
  <footer class="provenance"><span>${finalized ? `Finalized ${escapeOfficialDocumentHtml(new Date(document.finalizedAt ?? "").toLocaleString("en-NA", { timeZone: "Africa/Windhoek" }))} · Author: ${escapeOfficialDocumentHtml(author)} · Revision ${document.revisionNumber}` : `Draft · Revision ${document.revisionNumber}`}</span><span>ScolaPro official correspondence</span></footer>
  </main>${input.printImmediately ? '<script>addEventListener("load",()=>window.print(),{once:true})</script>' : ""}</body></html>`;
}
