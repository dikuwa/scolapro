import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teacher_professional_document_review_submissions")
    .select("document:teacher_professional_documents(storage_path,original_filename)")
    .eq("id", id)
    .maybeSingle();

  const document = Array.isArray(data?.document) ? data?.document[0] : data?.document;
  if (error || !document) {
    return NextResponse.json({ message: "Professional review file not found." }, { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const admin = createSupabaseAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from("teacher-professional-documents")
    .createSignedUrl(
      document.storage_path,
      60,
      download ? { download: document.original_filename } : undefined,
    );

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ message: "The submitted file is temporarily unavailable." }, { status: 502 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
