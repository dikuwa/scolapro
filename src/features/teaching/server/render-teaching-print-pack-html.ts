import "server-only";

import {
  OFFICIAL_DOCUMENT_A4_PAGE_RULE,
  OFFICIAL_DOCUMENT_FRAME_RULE,
  OFFICIAL_DOCUMENT_HEADER_RULE,
  OFFICIAL_DOCUMENT_METADATA_RULE,
  OFFICIAL_DOCUMENT_PRINT_RULE,
} from "@/features/documents/server/official-document-chrome";
import { renderOfficialDocumentHtmlFooter } from "@/features/documents/server/official-document-html-footer";
import {
  escapeOfficialDocumentHtml,
  renderOfficialDocumentHtmlHeader,
} from "@/features/documents/server/official-document-html-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import type { TeachingPrintPack } from "./teaching-print-pack";

const labels: Record<string, string> = {
  resources: "Resources / materials",
  introduction: "Introduction",
  lessonStructure: "Lesson structure",
  teacherActivities: "Teacher activities",
  learnerActivities: "Learner activities",
  consolidation: "Consolidation",
  assessment: "Assessment / homework / tasks / exercises",
  homeworkMonitoring: "Homework monitoring",
  englishAcrossCurriculum: "English Across Curriculum",
  compensatoryTeaching: "Compensatory teaching",
  reflectionAmendments: "Reflection / amendments",
};

function list(values: string[]) {
  if (!values.length) return '<p class="muted">No registry value available.</p>';
  return `<ul>${values.map((value) => `<li>${escapeOfficialDocumentHtml(value)}</li>`).join("")}</ul>`;
}

export function renderTeachingPrintPackHtml(input: {
  header: OfficialDocumentHeaderModel;
  pack: TeachingPrintPack;
  generatedAt: string;
}) {
  const { header, pack } = input;
  const prepMarkup = Object.entries(labels)
    .map(([key, label]) => {
      const value = pack.preparation[key]?.trim();
      return `<section class="field"><h3>${escapeOfficialDocumentHtml(label)}</h3><p>${escapeOfficialDocumentHtml(value || "—")}</p></section>`;
    })
    .join("");
  const planRows = pack.plan.items
    .map(
      (item) => `<tr><td>${item.sequence}</td><td>${escapeOfficialDocumentHtml(item.theme || "—")}</td><td>${escapeOfficialDocumentHtml(item.topic)}</td><td>${escapeOfficialDocumentHtml(item.start || "—")}</td><td>${escapeOfficialDocumentHtml(item.end || "—")}</td><td>${item.periods}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeOfficialDocumentHtml(pack.subjectName)} teaching print pack</title>
<style>
${OFFICIAL_DOCUMENT_A4_PAGE_RULE}
*{box-sizing:border-box}:root{--ink:#151515;--line:#4a4a4a;--muted:#555}html,body{margin:0;padding:0;background:#fff;color:var(--ink)}
body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:9px;line-height:1.35}
${OFFICIAL_DOCUMENT_FRAME_RULE}
${OFFICIAL_DOCUMENT_HEADER_RULE}
.logo-wrap{display:flex;align-items:center;justify-content:center;height:76px}.school-logo{max-width:76px;max-height:76px;object-fit:contain}.logo-placeholder{min-height:60px}
.school-identity{text-align:center}.school-name{margin:0;font-size:24px}.school-name.old-english{font-family:"Old English Text MT","Times New Roman",serif;font-weight:400;font-size:28px}.former-name{font-size:8px}.school-contact{margin-top:6px;font-size:7px;display:inline-block;text-align:left}.postal{font-size:8px;align-self:end}.emis{font-size:7px;color:var(--muted)}
.title{border:1px solid var(--line);border-top:0;padding:8px;text-align:center}.title h2{margin:0;font-size:13px}.meta{margin-top:4px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
.notice{margin:7px 0;border:1px solid var(--line);padding:6px;font-size:7px}.section-title{margin:8px 0 4px;font-size:10px;border-bottom:1px solid var(--line);padding-bottom:3px;break-after:avoid;page-break-after:avoid}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}.field{border:1px solid #aaa;padding:6px;break-inside:avoid}.field h3{margin:0 0 3px;font-size:7px;text-transform:uppercase}.field p{margin:0;white-space:pre-wrap}
table{width:100%;border-collapse:collapse;font-size:7px}th,td{border:1px solid var(--line);padding:3px 4px;vertical-align:top}th{text-align:left}ul{margin:3px 0 0;padding-left:16px}.muted{color:var(--muted)}
.coverage{border:1px solid var(--line);padding:6px}.coverage p{margin:2px 0}
${OFFICIAL_DOCUMENT_METADATA_RULE}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}${OFFICIAL_DOCUMENT_PRINT_RULE}}
</style></head><body><main class="report">
${renderOfficialDocumentHtmlHeader(header)}
<section class="title document-title"><h2>Teaching Print Pack</h2><div class="meta">
<span><strong>Teacher:</strong> ${escapeOfficialDocumentHtml(pack.teacherName)}</span>
<span><strong>Subject:</strong> ${escapeOfficialDocumentHtml(pack.subjectName)}</span>
<span><strong>Class:</strong> ${escapeOfficialDocumentHtml(pack.gradeName)} · ${escapeOfficialDocumentHtml(pack.className)}</span>
<span><strong>Year:</strong> ${pack.academicYear}</span>
${pack.termName ? `<span><strong>Term:</strong> ${escapeOfficialDocumentHtml(pack.termName)}</span>` : ""}
<span><strong>Lesson:</strong> ${escapeOfficialDocumentHtml(pack.plannedOn)}</span>
</div></section>
<div class="notice">ScolaPro teaching record export. This layout is not presented as an official NIED or Ministry form. Content is derived from governed teaching records and does not change preparation, review, readiness or coverage state.</div>
<h2 class="section-title">Lesson preparation</h2>
<p><strong>Theme / topic:</strong> ${escapeOfficialDocumentHtml([pack.theme,pack.topic].filter(Boolean).join(" · ") || "—")} · <strong>Curriculum version:</strong> ${escapeOfficialDocumentHtml(pack.curriculumVersion || "—")} · <strong>Status:</strong> ${escapeOfficialDocumentHtml(pack.preparationStatus)}</p>
<div class="grid">${prepMarkup}</div>
<h2 class="section-title">Curriculum context</h2><div class="grid"><section class="field"><h3>Objectives</h3>${list(pack.objectives)}</section><section class="field"><h3>Competencies</h3>${list(pack.competencies)}</section></div>
<h2 class="section-title">Connected year plan / scheme view</h2>
<table><thead><tr><th>#</th><th>Theme</th><th>Topic</th><th>Start</th><th>End</th><th>Periods</th></tr></thead><tbody>${planRows || '<tr><td colspan="6">No connected plan items available.</td></tr>'}</tbody></table>
<h2 class="section-title">Coverage / reflection</h2>
${pack.coverage ? `<section class="coverage remarks"><p><strong>Taught:</strong> ${escapeOfficialDocumentHtml(pack.coverage.taughtOn)} · <strong>Periods:</strong> ${pack.coverage.periodsUsed} · <strong>Coverage:</strong> ${escapeOfficialDocumentHtml(pack.coverage.state)}</p><p><strong>Reflection:</strong> ${escapeOfficialDocumentHtml(pack.coverage.reflection || "—")}</p><p><strong>Compensatory action:</strong> ${escapeOfficialDocumentHtml(pack.coverage.compensatoryAction || "—")}</p></section>` : '<p class="muted">No actual teaching / coverage record exists for this scheduled lesson.</p>'}
<section class="remarks"><h2 class="section-title">Review provenance</h2>
<p><strong>Preparation ID:</strong> ${escapeOfficialDocumentHtml(pack.preparationId)} · <strong>Plan ID:</strong> ${escapeOfficialDocumentHtml(pack.plan.id)} · <strong>Plan:</strong> ${escapeOfficialDocumentHtml(pack.plan.level)} / ${escapeOfficialDocumentHtml(pack.plan.status)}</p>
<p><strong>Submitted:</strong> ${escapeOfficialDocumentHtml(pack.submittedAt || "—")} · <strong>Reviewed:</strong> ${escapeOfficialDocumentHtml(pack.reviewedAt || "—")} · <strong>Review note:</strong> ${escapeOfficialDocumentHtml(pack.reviewNote || "—")}</p></section>
${renderOfficialDocumentHtmlFooter({left:`Generated ${input.generatedAt}`,right:`Preparation ${pack.preparationId}`})}
</main></body></html>`;
}
