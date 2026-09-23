import { Buffer } from "node:buffer";
import { buildOfficialDocumentHeaderModel, officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import { renderTeachingPlanHtml } from "@/features/teaching/server/render-teaching-plan-html";
import { renderTeachingPlanPdf } from "@/features/teaching/server/render-teaching-plan-pdf";
import { getTeachingPlanDocument } from "@/features/teaching/server/teaching-plan-document";
import { getUserContext } from "@/lib/auth/get-user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilePart(value: string) { return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "teaching-plan"; }
async function storedLogoBytes(storagePath: string, signedUrl: string): Promise<Uint8Array | null> {
  if (!storagePath || !signedUrl) return null;
  const response = await fetch(signedUrl, { cache: "no-store" });
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (context.platformMemberships.length) return Response.json({ error: "School-operational planning export is not available to platform roles." }, { status: 403 });
  const url = new URL(request.url);
  const planId = url.searchParams.get("plan")?.trim() ?? "";
  const view = url.searchParams.get("view") === "scheme" ? "scheme" : "year-planner";
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "html";
  if (!planId) return Response.json({ error: "Plan ID is required." }, { status: 400 });

  const memberships = context.memberships.filter((item) => ["teacher", "class_teacher", "hod", "school_admin", "principal", "deputy_principal"].includes(item.roleKey));
  for (const membership of memberships) {
    const document = await getTeachingPlanDocument(membership.schoolId, planId);
    if (!document) continue;
    const profile = await getLiveSchoolDocumentProfile(membership.schoolId);
    const header = buildOfficialDocumentHeaderModel(profile, { mode: officialDocumentHeaderModeForType("teaching_print_pack"), provenanceSource: "live_school_profile" });
    const generatedAt = new Intl.DateTimeFormat("en-NA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Windhoek" }).format(new Date());
    const fileBase = `${safeFilePart(document.subject)}-${safeFilePart(document.grade)}-${view}`;
    if (format === "pdf") {
      const rendered = await renderTeachingPlanPdf({ header, document, view, generatedAt, logoBytes: await storedLogoBytes(profile.logoStoragePath, profile.logoUrl) });
      return new Response(Buffer.from(rendered.bytes), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileBase}.pdf"`, "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-ScolaPro-Page-Count": String(rendered.pageCount) } });
    }
    return new Response(renderTeachingPlanHtml({ header, document, view, generatedAt, autoPrint: url.searchParams.get("print") === "1" }), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `inline; filename="${fileBase}.html"`, "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  }
  return Response.json({ error: "Teaching plan not found in your current governed scope." }, { status: 404 });
}
