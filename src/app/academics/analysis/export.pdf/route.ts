import { NextResponse } from "next/server";
import type { AcademicAnalysisView } from "@/features/academics/server/academic-analysis";
import { getAcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import {
  academicAnalysisPdfFilename,
  renderAcademicAnalysisPdf,
} from "@/features/academics/server/render-academic-analysis-pdf";
import { officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";
import { loadOfficialDocumentLogoBytes } from "@/features/documents/server/official-document-logo-bytes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const academicYear = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const termNumber = Math.min(3, Math.max(1, Number(url.searchParams.get("term")) || 1));
  const basis = url.searchParams.get("basis") === "provisional" ? "provisional" : "official";
  const allowedViews: AcademicAnalysisView[] = ["overview", "results", "grades", "learners", "promotion_exceptions", "trends"];
  const requestedView = url.searchParams.get("view") as AcademicAnalysisView | null;
  const view: AcademicAnalysisView = requestedView && allowedViews.includes(requestedView) ? requestedView : "overview";
  const className = view === "trends" ? undefined : url.searchParams.get("class") || undefined;
  const teacher = view === "trends" ? undefined : url.searchParams.get("teacher") || undefined;
  const workspace = await getAcademicAnalysisWorkspace({
    academicYear,
    termNumber,
    basis,
    grade: url.searchParams.get("grade") || undefined,
    className,
    subjectOfferingId: url.searchParams.get("subject") || undefined,
    teacher,
  });
  if (!workspace) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const header = await getLiveSchoolDocumentHeader(
    workspace.schoolId,
    officialDocumentHeaderModeForType("academic_analysis"),
  );
  const logoBytes = await loadOfficialDocumentLogoBytes(header.logoStoragePath, header.logoUrl);
  const body = await renderAcademicAnalysisPdf(workspace, header, view, logoBytes);
  const disposition = url.searchParams.get("preview") === "1" ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition + '; filename="' + academicAnalysisPdfFilename(workspace, view) + '"',
      "Cache-Control": "private, no-store",
    },
  });
}
