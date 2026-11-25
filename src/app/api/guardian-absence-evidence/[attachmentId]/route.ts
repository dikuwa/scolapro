import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVIDENCE_BUCKET = "guardian-absence-evidence";

type RouteContext = { params: Promise<{ attachmentId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { attachmentId } = await context.params;
  const userClient = await createSupabaseServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // API routes bypass the page-level mandatory password rotation proxy.
  const { data: securityProfile, error: securityError } = await userClient
    .from("user_profiles")
    .select("must_change_password")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (securityError || !securityProfile || securityProfile.must_change_password !== false) {
    return NextResponse.json({ error: "Complete account security setup before opening evidence" }, { status: 403 });
  }

  // The authenticated client is the authorization boundary. RLS permits only the
  // submitting guardian or an authorized notice reviewer to read this attachment,
  // and the storage policy applies the same need-to-know authority to the object.
  const { data: attachment, error } = await userClient
    .from("guardian_absence_notice_attachments")
    .select("id,storage_bucket,storage_path")
    .eq("id", attachmentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Unable to authorize absence evidence" }, { status: 500 });
  if (!attachment || attachment.storage_bucket !== EVIDENCE_BUCKET) {
    return NextResponse.json({ error: "Absence evidence not found" }, { status: 404 });
  }

  // The service-role client is used only after RLS authorization and only against
  // the fixed private bucket. The URL expires quickly and is never persisted.
  const admin = createSupabaseAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(attachment.storage_path, 90);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Unable to open absence evidence" }, { status: 500 });
  }

  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
