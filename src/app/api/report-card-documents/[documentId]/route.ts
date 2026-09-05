import { NextResponse } from "next/server";
import { REPORT_CARD_RENDERER_VERSION } from "@/features/reporting/server/report-card-renderer-version";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ documentId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { documentId } = await context.params;
  const userClient = await createSupabaseServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The authenticated client is the authorization boundary. RLS permits only staff
  // with report access or a linked guardian reading a published learner report.
  // The active document route deliberately serves only the current renderer revision;
  // historical artifacts remain durable but are not exposed as current downloads.
  const { data: document, error } = await userClient
    .from("report_card_documents")
    .select("id,storage_bucket,storage_path,status,renderer_version")
    .eq("id", documentId)
    .eq("status", "ready")
    .eq("renderer_version", REPORT_CARD_RENDERER_VERSION)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Unable to authorize report document" }, { status: 500 });
  if (!document || document.storage_bucket !== "report-card-artifacts") {
    return NextResponse.json({ error: "Report document not found" }, { status: 404 });
  }

  // The service-role client is used only after RLS authorization and only against the
  // fixed private report-card bucket. The URL expires quickly and is never persisted.
  const admin = createSupabaseAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from("report-card-artifacts")
    .createSignedUrl(document.storage_path, 90);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Unable to open report document" }, { status: 500 });
  }

  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
