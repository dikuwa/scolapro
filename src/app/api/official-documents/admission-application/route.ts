import { Buffer } from "node:buffer";
import { officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";
import { renderAdmissionApplicationPdf } from "@/features/admissions/server/render-admission-application-pdf";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export async function GET(request: Request) {
  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch {
    return Response.json({ error: "Complete account security setup and verify school access." }, { status: 403 });
  }
  if (!context.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const membership = context.currentSchoolMembership;
  if (!membership || !managerRoles.has(membership.roleKey)) {
    return Response.json({ error: "Permission denied" }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedYear = Number(url.searchParams.get("year"));
  const academicYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200
    ? requestedYear
    : getNamibiaCalendarYear();
  const preview = url.searchParams.get("preview") === "1";

  try {
    const header = await getLiveSchoolDocumentHeader(
      membership.schoolId,
      officialDocumentHeaderModeForType("admission_application"),
    );
    const generatedAt = new Intl.DateTimeFormat("en-NA", {
      timeZone: "Africa/Windhoek",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date());
    const rendered = await renderAdmissionApplicationPdf({ header, academicYear, generatedAt });
    const filename = `learner-application-form-${academicYear}.pdf`;

    return new Response(Buffer.from(rendered.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-ScolaPro-Page-Count": String(rendered.pageCount),
      },
    });
  } catch (error) {
    console.error("admission application document generation failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Unable to generate the learner application form." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
