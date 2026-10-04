import { NextResponse } from "next/server";
import { getAcademicScheduleFilterOptions, getAcademicSchedulePayload, getAcademicScheduleSnapshot, type AcademicScheduleType } from "@/features/reporting/server/academic-schedules";
import { officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentHeader, resolveFrozenOfficialDocumentHeaderAssets } from "@/features/documents/server/live-school-document-profile";
import { loadOfficialDocumentLogoBytes } from "@/features/documents/server/official-document-logo-bytes";
import { academicSchedulePdfFilename, renderAcademicSchedulePdf } from "@/features/reporting/server/render-academic-schedule-pdf";
import { getUserContext } from "@/lib/auth/get-user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const snapshotId = url.searchParams.get("snapshot");
  const frozen = snapshotId ? await getAcademicScheduleSnapshot(snapshotId) : null;
  if (snapshotId && !frozen) return NextResponse.json({ error: "Issued schedule snapshot not found." }, { status: 404 });
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const document = url.searchParams.get("document") === "all_results" || url.searchParams.get("type") === "term_schedule" ? "all_results" : "promotion";
  const allTerms = document === "promotion" && (url.searchParams.get("period") === "all" || url.searchParams.get("type") === "promotion_all_terms");
  const options = await getAcademicScheduleFilterOptions(year);
  const term = allTerms ? (options.terms.at(-1)?.number ?? 1) : Math.min(6, Math.max(1, Number(url.searchParams.get("period") ?? url.searchParams.get("term")) || 1));
  const basis = url.searchParams.get("basis") === "provisional" ? "provisional" : "official";
  const scheduleType: AcademicScheduleType = document === "all_results" ? "term_schedule" : allTerms ? "promotion_all_terms" : "promotion_schedule";
  const gradeRef = url.searchParams.get("grade");
  const gradeOption = options.grades.find((row) => row.value === gradeRef || row.label === gradeRef || row.code === gradeRef);
  if (!frozen && gradeRef && !gradeOption) return NextResponse.json({ error: "Invalid academic schedule grade scope." }, { status: 400 });
  const gradeId = gradeOption?.value ?? options.grades[0]?.value;
  const classOptions = gradeId ? (options.classesByGrade[gradeId] ?? []) : [];
  const rawClassScope = (url.searchParams.get("classes") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const classIds = [...new Set(rawClassScope.map((value) => classOptions.find((row) => row.value === value || row.label === value || row.code === value)?.value).filter((value): value is string => Boolean(value)))].sort();
  if (!frozen && rawClassScope.length && classIds.length !== new Set(rawClassScope).size) return NextResponse.json({ error: "Invalid academic schedule class scope." }, { status: 400 });
  const payload = frozen?.payload ?? await getAcademicSchedulePayload({ academicYear: year, termNumber: term, basis, scheduleType, gradeId, classIds });
  if (!payload) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const context = await getUserContext();
  if (!context.currentSchoolMembership) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  if (frozen && !frozen.header) return NextResponse.json({ error: "Issued schedule header is unavailable." }, { status: 409 });
  const header = frozen?.header
    ? await resolveFrozenOfficialDocumentHeaderAssets(frozen.header)
    : await getLiveSchoolDocumentHeader(context.currentSchoolMembership.schoolId, officialDocumentHeaderModeForType("academic_schedule"));
  const lifecycle = frozen ? { version: frozen.version, status: frozen.status, finalizedAt: frozen.finalizedAt, supersessionReason: frozen.supersessionReason } : undefined;
  const logoBytes = await loadOfficialDocumentLogoBytes(header.logoStoragePath, header.logoUrl);
  const body = await renderAcademicSchedulePdf(payload, header, lifecycle, logoBytes);
  const disposition = url.searchParams.get("preview") === "1" ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(body), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${disposition}; filename="${academicSchedulePdfFilename(payload, lifecycle)}"`,
    "Cache-Control": "private, no-store",
  } });
}
