import { buildOfficialDocumentHeaderModel, officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import { getRegisterTeacherDocument } from "@/features/attendance/server/register-teacher-document";
import { renderRegisterTeacherHtml } from "@/features/attendance/server/render-register-teacher-html";
import { getUserContext } from "@/lib/auth/get-user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Windhoek" }).format(new Date());
}

export async function GET(request: Request) {
  let context: Awaited<ReturnType<typeof getUserContext>>;
  try {
    context = await getUserContext();
  } catch {
    return Response.json({ error: "Complete account security setup and verify school access." }, { status: 403 });
  }
  if (!context.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const allowedRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher"]);
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey));
  if (!membership) return Response.json({ error: "School membership required" }, { status: 403 });

  const url = new URL(request.url);
  const classId = url.searchParams.get("class")?.trim() ?? "";
  const date = safeDate(url.searchParams.get("date"));
  const academicYear = Number(url.searchParams.get("year") ?? date.slice(0, 4));
  const requestedMode = url.searchParams.get("mode");
  const mode = requestedMode === "term" ? "term" : requestedMode === "range" ? "range" : "week";
  const termId = url.searchParams.get("term") || null;
  const fromWeek = url.searchParams.get("fromWeek") || null;
  const toWeek = url.searchParams.get("toWeek") || null;

  if (!classId) return Response.json({ error: "Register class is required." }, { status: 400 });
  if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2200) {
    return Response.json({ error: "Academic year is invalid." }, { status: 400 });
  }

  try {
    const [document, profile] = await Promise.all([
      getRegisterTeacherDocument({
        schoolId: membership.schoolId,
        academicYear,
        classId,
        mode,
        selectedDate: date,
        requestedTermId: termId,
        fromWeek,
        toWeek,
      }),
      getLiveSchoolDocumentProfile(membership.schoolId),
    ]);

    const header = buildOfficialDocumentHeaderModel(profile, {
      mode: officialDocumentHeaderModeForType("register_teacher"),
      provenanceSource: "live_school_profile",
    });
    const html = renderRegisterTeacherHtml({ header, document });
    const fileBase = `${document.className.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${mode}-register-${document.scopeEnd}`;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${fileBase}.html"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("register teacher document failed", { message });
    if (/calendar is not ready/i.test(message)) {
      return Response.json({ error: message }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    if (/week|range/i.test(message)) {
      return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Unable to generate the register teacher document." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
