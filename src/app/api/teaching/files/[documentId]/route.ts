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
