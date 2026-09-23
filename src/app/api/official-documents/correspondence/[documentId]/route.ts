import { Buffer } from "node:buffer";
import { getCorrespondenceDocument } from "@/features/correspondence/server/queries";
import { renderCorrespondenceHtml } from "@/features/correspondence/server/render-correspondence-html";
import { renderCorrespondencePdf } from "@/features/correspondence/server/render-correspondence-pdf";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime="nodejs"; export const dynamic="force-dynamic";
const roles=new Set(["school_admin","principal","deputy_principal"]);
function safeName(value:string){return value.trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60)||"correspondence";}
async function logoBytes(header:OfficialDocumentHeaderModel){if(!header.logoStoragePath)return null;const db=await createSupabaseServerClient();const {data,error}=await db.storage.from("school-document-assets").download(header.logoStoragePath);if(error||!data)return null;return new Uint8Array(await data.arrayBuffer());}

export async function GET(request:Request,{params}:{params:Promise<{documentId:string}>}){
  const context=await getUserContext();if(!context.user)return Response.json({error:"Unauthorized"},{status:401});
  const membership=context.memberships.find((item)=>roles.has(item.roleKey));if(!membership||context.platformMemberships.length>0)return Response.json({error:"Forbidden"},{status:403});
  const {documentId}=await params;const document=await getCorrespondenceDocument(documentId);if(!document||document.schoolId!==membership.schoolId)return Response.json({error:"Not found"},{status:404});
  const header=document.status==="finalized"?document.headerSnapshot:await getLiveSchoolDocumentHeader(document.schoolId,"external_correspondence");if(!header)return Response.json({error:"Finalized header snapshot is unavailable"},{status:409});
  const bytes=await logoBytes(header);const url=new URL(request.url);const format=url.searchParams.get("format");const file=`${safeName(document.referenceNumber??document.subject)}-r${document.revisionNumber}`;
  try{if(format==="pdf"){const rendered=await renderCorrespondencePdf({document,header,logoBytes:bytes});return new Response(Buffer.from(rendered.bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${file}.pdf"`,"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-ScolaPro-Page-Count":String(rendered.pageCount)}});}
    const html=renderCorrespondenceHtml({document,header,logoBytes:bytes,printImmediately:url.searchParams.get("print")==="1"});return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Content-Disposition":`inline; filename="${file}.html"`,"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'"}});
  }catch(error){console.error("official correspondence export failed",{documentId,error:error instanceof Error?error.message:"unknown"});return Response.json({error:"Unable to generate official correspondence."},{status:500,headers:{"Cache-Control":"no-store"}});}
}
