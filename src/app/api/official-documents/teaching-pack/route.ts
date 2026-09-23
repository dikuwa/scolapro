import { Buffer } from "node:buffer";
import {
  buildOfficialDocumentHeaderModel,
  officialDocumentHeaderModeForType,
} from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import { renderTeachingPrintPackHtml } from "@/features/teaching/server/render-teaching-print-pack-html";
import { renderTeachingPrintPackPdf } from "@/features/teaching/server/render-teaching-print-pack-pdf";
import { getTeachingPrintPack } from "@/features/teaching/server/teaching-print-pack";
import { getUserContext } from "@/lib/auth/get-user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "teaching";
}

async function storedLogoBytes(storagePath: string, signedUrl: string): Promise<Uint8Array | null> {
  if (!storagePath || !signedUrl) return null;
  const response = await fetch(signedUrl, { cache: "no-store" });
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (context.platformMemberships.length) {
    return Response.json({ error: "School-operational teaching export is not available to platform roles." }, { status: 403 });
  }

  const url = new URL(request.url);
  const preparationId = url.searchParams.get("preparation")?.trim() ?? "";
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "html";
  if (!preparationId) return Response.json({ error: "Preparation ID is required." }, { status: 400 });

  const memberships = context.memberships.filter((item) =>
    ["teacher", "class_teacher", "hod", "school_admin", "principal", "deputy_principal"].includes(item.roleKey),
  );
  if (!memberships.length) return Response.json({ error: "Teaching access required." }, { status: 403 });

  for (const membership of memberships) {
    const pack = await getTeachingPrintPack(membership.schoolId, preparationId);
    if (!pack) continue;

    const profile = await getLiveSchoolDocumentProfile(membership.schoolId);
    const header = buildOfficialDocumentHeaderModel(profile, {
      mode: officialDocumentHeaderModeForType("teaching_print_pack"),
      provenanceSource: "live_school_profile",
    });
    const generatedAt = new Intl.DateTimeFormat("en-NA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Windhoek",
    }).format(new Date());
    const fileBase = `${safeFilePart(pack.subjectName)}-${safeFilePart(pack.className)}-${pack.plannedOn}-teaching-pack`;

    if (format === "pdf") {
      const logoBytes = await storedLogoBytes(profile.logoStoragePath, profile.logoUrl);
      const rendered = await renderTeachingPrintPackPdf({ header, pack, generatedAt, logoBytes });
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

    return new Response(renderTeachingPrintPackHtml({ header, pack, generatedAt }), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${fileBase}.html"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  return Response.json({ error: "Teaching preparation not found in your governed scope." }, { status: 404 });
}
