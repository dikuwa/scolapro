import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { buildOfficialDocumentHeaderModel, officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
import { loadOfficialDocumentLogoBytes } from "@/features/documents/server/official-document-logo-bytes";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import {
  getRegisterTeacherDocument,
  type RegisterTeacherMode,
} from "@/features/attendance/server/register-teacher-document";
import { RegisterTeacherFullTermError } from "@/features/attendance/server/register-teacher-full-term";
import { planRegisterTeacherFullTermDocument } from "@/features/attendance/server/register-teacher-full-term-layout";
import { renderRegisterTeacherHtml } from "@/features/attendance/server/render-register-teacher-html";
import { renderRegisterTeacherPdf } from "@/features/attendance/server/render-register-teacher-pdf";
import { renderRegisterTeacherFullTermHtml } from "@/features/attendance/server/render-register-teacher-full-term-html";
import { renderRegisterTeacherFullTermPdf } from "@/features/attendance/server/render-register-teacher-full-term-pdf";
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
  const url = new URL(request.url);
  const requestedSchoolId = url.searchParams.get("school")?.trim() || null;
  const membership = context.memberships.find((item) => allowedRoles.has(item.roleKey) && (!requestedSchoolId || item.schoolId === requestedSchoolId));
  if (!membership) return Response.json({ error: "School membership required" }, { status: 403 });

  const classId = url.searchParams.get("class")?.trim() ?? "";
  const date = safeDate(url.searchParams.get("date"));
  const academicYear = Number(url.searchParams.get("year") ?? date.slice(0, 4));
  const requestedMode = url.searchParams.get("mode");
  const fullTermRequested = requestedMode === "full-term";
  const mode: RegisterTeacherMode = fullTermRequested || requestedMode === "term"
    ? "term"
    : requestedMode === "range"
      ? "range"
      : "week";
  const termId = url.searchParams.get("term") || null;
  const closingDate = url.searchParams.get("closingDate") || null;
  const fromWeek = url.searchParams.get("fromWeek") || null;
  const toWeek = url.searchParams.get("toWeek") || null;
  const requestedFormat = url.searchParams.get("format");
  const format = requestedFormat === "pdf" ? "pdf" : requestedFormat === "bundle" ? "bundle" : "html";

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
        fullTerm: fullTermRequested ? { closingDate } : null,
        fromWeek,
        toWeek,
      }),
      getLiveSchoolDocumentProfile(membership.schoolId),
    ]);

    const header = buildOfficialDocumentHeaderModel(profile, {
      mode: officialDocumentHeaderModeForType("register_teacher"),
      provenanceSource: "live_school_profile",
    });
    const fileMode = fullTermRequested ? "full-term" : mode;
    const fileBase = `${document.className.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${fileMode}-register-${document.scopeEnd}`;

    // Full-term is an opt-in single-sheet presentation of the same governed
    // document. If A2/A1 cannot honour the 8pt/7pt floors, the unchanged
    // paginated term output is returned with an explicit notice; a multi-page
    // export is never labelled as a single sheet.
    const plan = fullTermRequested ? planRegisterTeacherFullTermDocument(document) : null;
    const singleSheet = Boolean(plan?.fits);
    const notice = fullTermRequested && plan && !plan.fits
      ? `The full-term single sheet cannot fit A2 or A1 landscape at the approved 8pt/7pt legibility floor. ${plan.reason ?? ""} The unchanged paginated term register is shown instead.`.trim()
      : null;
    const renderHtml = () => singleSheet && plan
      ? renderRegisterTeacherFullTermHtml({ header, document, plan })
      : renderRegisterTeacherHtml({ header, document, notice });

    if (format === "pdf" || format === "bundle") {
      const logoBytes = await loadOfficialDocumentLogoBytes(profile.logoStoragePath, profile.logoUrl);
      const rendered = singleSheet && plan
        ? await renderRegisterTeacherFullTermPdf({ header, document, plan, logoBytes })
        : await renderRegisterTeacherPdf({ header, document, logoBytes, notice });
      if (format === "bundle") {
        const identity = createHash("sha256")
          .update(JSON.stringify({ document, plan: plan ? { paper: plan.paper, fits: plan.fits } : null }))
          .digest("hex")
          .slice(0, 24);
        return Response.json({
          identity,
          html: renderHtml(),
          pdfBase64: Buffer.from(rendered.bytes).toString("base64"),
          fileName: `${fileBase}.pdf`,
          ...(notice ? { notice } : {}),
          ...(singleSheet && plan ? { paper: plan.paper } : {}),
          pageCount: rendered.pageCount,
        }, {
          status: 200,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
      return new Response(Buffer.from(rendered.bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-ScolaPro-Page-Count": String(rendered.pageCount),
        },
      });
    }

    return new Response(renderHtml(), {
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
    if (error instanceof RegisterTeacherFullTermError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    if (/calendar is not ready/i.test(message)) {
      return Response.json({ error: message }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    if (/week|range|closing date|learner term/i.test(message)) {
      return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Unable to generate the register teacher document." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
