import { Buffer } from "node:buffer";
import { buildOfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import { renderOfficialClassListHtml } from "@/features/documents/server/render-official-class-list-html";
import { renderOfficialClassListPdf } from "@/features/documents/server/render-official-class-list-pdf";
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

async function loadStoredLogoBytes(storagePath: string, signedUrl: string): Promise<Uint8Array | null> {
  if (!storagePath || !signedUrl) return null;
  const response = await fetch(signedUrl, { cache: "no-store" });
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
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
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "html";
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
    const generatedAt = new Intl.DateTimeFormat("en-NA", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date());
    const rows = roster.learners.map((learner) => ({
      learnerName: learner.name,
      admissionNumber: learner.admissionNumber,
      sex: learner.sex,
      status: learner.status,
    }));
    const fileBase = `${safeFilePart(roster.registerClass)}-${academicYear}-class-list`;

    if (format === "pdf") {
      // Only fetch a server-managed stored logo. A legacy/external logo URL is
      // left to HTML rendering so arbitrary configured URLs are never fetched
      // server-side by the PDF endpoint.
      const logoBytes = await loadStoredLogoBytes(profile.logoStoragePath, profile.logoUrl);
      const rendered = await renderOfficialClassListPdf({
        header,
        academicYear,
        grade: roster.grade,
        registerClass: roster.registerClass,
        rows,
        generatedAt,
        logoBytes,
      });
      return new Response(Buffer.from(rendered.bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "X-ScolaPro-Page-Count": String(rendered.pageCount),
        },
      });
    }

    const html = renderOfficialClassListHtml({
      header,
      academicYear,
      grade: roster.grade,
      registerClass: roster.registerClass,
      rows,
      generatedAt,
    });

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${fileBase}.html"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate the official class list.";
    return Response.json({ error: message }, { status: 500 });
  }
}
