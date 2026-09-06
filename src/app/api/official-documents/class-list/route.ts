import { buildOfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import { renderOfficialClassListHtml } from "@/features/documents/server/render-official-class-list-html";
import { getOfficialClassListRoster } from "@/features/learners/server/class-list";
import { getUserContext } from "@/lib/auth/get-user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "class";
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Match the learner directory's current access boundary: an authenticated
  // active school membership scopes the export to that membership's school.
  const membership = context.memberships[0];
  if (!membership) return Response.json({ error: "School membership required" }, { status: 403 });

  const url = new URL(request.url);
  const grade = url.searchParams.get("grade")?.trim() ?? "";
  const registerClass = url.searchParams.get("class")?.trim() ?? "";
  const requestedYear = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const academicYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
    ? requestedYear
    : new Date().getFullYear();

  if (!grade || !registerClass || grade === "all" || registerClass === "all") {
    return Response.json({ error: "Select a specific grade and register class before exporting a class list." }, { status: 400 });
  }

  try {
    const [profile, roster] = await Promise.all([
      getLiveSchoolDocumentProfile(membership.schoolId),
      getOfficialClassListRoster(membership.schoolId, academicYear, grade, registerClass),
    ]);
    const header = buildOfficialDocumentHeaderModel(profile);
    const html = renderOfficialClassListHtml({
      header,
      academicYear,
      grade: roster.grade,
      registerClass: roster.registerClass,
      rows: roster.learners.map((learner) => ({
        learnerName: learner.name,
        admissionNumber: learner.admissionNumber,
        sex: learner.sex,
        status: learner.status,
      })),
      generatedAt: new Intl.DateTimeFormat("en-NA", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date()),
    });
    const filename = `${safeFilePart(roster.registerClass)}-${academicYear}-class-list.html`;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate the official class list.";
    return Response.json({ error: message }, { status: 500 });
  }
}
