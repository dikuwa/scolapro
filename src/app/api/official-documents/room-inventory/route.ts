import { Buffer } from "node:buffer";
import { buildOfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentProfile } from "@/features/documents/server/live-school-document-profile";
import { renderOfficialDocumentVerificationQrSvg } from "@/features/documents/server/official-document-verification";
import { renderVerifiedRoomInventoryHtml } from "@/features/room-inventory/server/render-verified-sheet-html";
import { renderVerifiedRoomInventoryPdf } from "@/features/room-inventory/server/render-verified-sheet-pdf";
import { getVerifiedRoomInventorySheet } from "@/features/room-inventory/server/verified-sheet";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "room-inventory";
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const membership = context.currentSchoolMembership;
  if (!membership) return Response.json({ error: "School membership required" }, { status: 403 });

  const url = new URL(request.url);
  const roomId = url.searchParams.get("room") ?? "";
  if (!UUID_PATTERN.test(roomId)) {
    return Response.json({ error: "A valid room is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: room, error: roomError } = await supabase
    .from("school_rooms")
    .select("id")
    .eq("id", roomId)
    .eq("school_id", membership.schoolId)
    .maybeSingle();

  if (roomError) {
    console.error("room inventory export scope query failed", { code: roomError.code, message: roomError.message });
    return Response.json({ error: "Unable to verify room scope." }, { status: 500 });
  }
  if (!room) return Response.json({ error: "Room not found in the current school." }, { status: 404 });

  try {
    const sheet = await getVerifiedRoomInventorySheet(roomId);
    if (!sheet) {
      return Response.json(
        { error: "This room does not yet have an eligible finalized verification. Verify the inventory again before exporting." },
        { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }

    const profile = await getLiveSchoolDocumentProfile(membership.schoolId);
    const header = buildOfficialDocumentHeaderModel(profile, {
      mode: "internal_school",
      provenanceSource: "live_school_profile",
    });
    const origin = url.origin;
    const verificationUrl = `${origin}${sheet.verificationPath}`;
    const fileBase = `${safeFilePart(sheet.roomDisplayName)}-verified-room-inventory-r${sheet.revision}`;

    if (url.searchParams.get("format") === "pdf") {
      const rendered = await renderVerifiedRoomInventoryPdf({
        header,
        sheet,
        verificationUrl,
        logoBytes: null,
      });
      return new Response(Buffer.from(rendered.bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${fileBase}.pdf"`,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-ScolaPro-Page-Count": String(rendered.pageCount),
        },
      });
    }

    const qrSvg = await renderOfficialDocumentVerificationQrSvg({
      token: sheet.verificationToken,
      origin,
    });
    const html = renderVerifiedRoomInventoryHtml({
      header,
      sheet,
      verificationUrl,
      qrSvg,
    });
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
    if (/access|scope|permission/i.test(message)) {
      return Response.json({ error: "This room is outside your active inventory scope." }, { status: 403 });
    }
    console.error("verified room inventory export failed", { message });
    return Response.json(
      { error: "Unable to generate the verified room inventory sheet." },
      { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
