import { NextResponse } from "next/server";
import { getAcademicAnalysisWorkspace } from "@/features/academics/server/academic-analysis";
import { academicAnalysisXlsxFilename, renderAcademicAnalysisXlsx } from "@/features/academics/server/render-academic-analysis-xlsx";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const academicYear = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const termNumber = Math.min(3, Math.max(1, Number(url.searchParams.get("term")) || 1));
  const basis = url.searchParams.get("basis") === "provisional" ? "provisional" : "official";
  const workspace = await getAcademicAnalysisWorkspace({
    academicYear,
    termNumber,
    basis,
    grade: url.searchParams.get("grade") || undefined,
    className: url.searchParams.get("class") || undefined,
    subjectOfferingId: url.searchParams.get("subject") || undefined,
    teacher: url.searchParams.get("teacher") || undefined,
  });
  if (!workspace) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = renderAcademicAnalysisXlsx(workspace);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${academicAnalysisXlsxFilename(workspace)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
