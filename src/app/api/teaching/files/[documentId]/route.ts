import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await context.params;
  const supabase = await createSupabaseServerClient();

  const { data: { user: verifiedUser }, error: userError } = await supabase.auth.getUser();
  if (userError || !verifiedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: securityProfile, error: securityError } = await supabase
    .from("user_profiles")
    .select("must_change_password")
    .eq("user_id", verifiedUser.id)
    .maybeSingle();
  if (securityError || !securityProfile || securityProfile.must_change_password !== false) {
    return NextResponse.json({ error: "Complete account security setup before downloading documents." }, { status: 403 });
  }

  const { data: document, error } = await supabase
    .from("teacher_professional_documents")
    .select("id,storage_path,original_filename,status")
    .eq("id", documentId)
    .maybeSingle();

  if (error || !document) {
    return NextResponse.json({ message: "Professional document not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";

  const admin = createSupabaseAdminClient();
  const { data, error: signedError } = await admin.storage
    .from("teacher-professional-documents")
    .createSignedUrl(
      document.storage_path,
      60,
      download ? { download: document.original_filename } : undefined,
    );

  if (signedError || !data?.signedUrl) {
    console.error("Teacher professional document signed download failed", {
      documentId,
      error: signedError?.message,
    });
    return NextResponse.json({ message: "The professional document is temporarily unavailable." }, { status: 502 });
  }

  return NextResponse.redirect(data.signedUrl);
}
