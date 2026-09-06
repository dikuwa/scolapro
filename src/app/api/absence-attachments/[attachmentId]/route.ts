import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request,{params}:{params:Promise<{attachmentId:string}>}){
  const {attachmentId}=await params;
  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.from("guardian_absence_notice_attachments").select("storage_bucket,storage_path,file_name").eq("id",attachmentId).maybeSingle();
  if(error||!data)return NextResponse.json({message:"Document not found."},{status:404});
  const admin=createSupabaseAdminClient();
  const {data:signed,error:signedError}=await admin.storage.from(data.storage_bucket).createSignedUrl(data.storage_path,90,{download:data.file_name});
  if(signedError||!signed)return NextResponse.json({message:"Document could not be opened."},{status:503});
  return NextResponse.redirect(signed.signedUrl);
}
