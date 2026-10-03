import { Buffer } from "node:buffer";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";
import {
  renderSportsHouseRosterHtml,
  renderSportsHouseRosterPdf,
  renderSportsHouseRosterXlsx,
} from "@/features/documents/server/sports-house-roster-document";
import { getSportsHousesWorkspace } from "@/features/sports-houses/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readerRoles = new Set(["school_admin","principal","deputy_principal","hod","teacher","class_teacher"]);

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60) || "house-rosters";
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context.user) return Response.json({ error: "Unauthorized" },{ status:401 });
  if (context.platformMemberships.some((item)=>item.roleKey==="platform_support")) return Response.json({ error:"Permission denied" },{ status:403 });

  const url = new URL(request.url);
  const requestedSchool = url.searchParams.get("school");
  const platformAdmin = context.platformMemberships.some((item)=>item.roleKey==="platform_admin");
  const membership = context.memberships.find((item)=>readerRoles.has(item.roleKey));
  const schoolId = platformAdmin && requestedSchool ? requestedSchool : membership?.schoolId;
  if (!schoolId) return Response.json({ error:"School membership required" },{ status:403 });

  const requestedYear = Number(url.searchParams.get("year"));
  const academicYear = Number.isInteger(requestedYear) && requestedYear>=2000 && requestedYear<=2200 ? requestedYear : new Date().getFullYear();
  const format = url.searchParams.get("format")==="pdf" ? "pdf" : url.searchParams.get("format")==="xlsx" ? "xlsx" : "html";

  try {
    const workspace = await getSportsHousesWorkspace(schoolId,academicYear);
    const requestedIds = new Set((url.searchParams.get("houses")??"").split(",").map((item)=>item.trim()).filter(Boolean));
    const selectedHouses = requestedIds.size ? workspace.houses.filter((house)=>requestedIds.has(house.id)) : workspace.houses.filter((house)=>house.status==="active");
    if (!selectedHouses.length) return Response.json({ error:"No valid houses were selected." },{ status:404 });
    if (requestedIds.size && selectedHouses.length!==requestedIds.size) return Response.json({ error:"A selected house is outside this school." },{ status:403 });

    const header = await getLiveSchoolDocumentHeader(schoolId,"internal_school");
    const generatedAt = new Intl.DateTimeFormat("en-NA",{day:"2-digit",month:"long",year:"numeric"}).format(new Date());
    const input = {
      header,
      schoolName: workspace.schoolName,
      academicYear,
      generatedAt,
      sections: selectedHouses.map((house)=>({
        house,
        learners: workspace.learners.filter((learner)=>learner.houseId===house.id),
        staff: workspace.staff.filter((person)=>person.houseId===house.id),
      })),
    };
    const fileBase=safeFilePart(`sports-house-rosters-${academicYear}-${selectedHouses.length}`);

    if(format==="xlsx"){
      const bytes=renderSportsHouseRosterXlsx(input);
      return new Response(bytes,{status:200,headers:{
        "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":`attachment; filename="${fileBase}.xlsx"`,
        "Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
      }});
    }
    if(format==="pdf"){
      const bytes=await renderSportsHouseRosterPdf(input);
      return new Response(Buffer.from(bytes),{status:200,headers:{
        "Content-Type":"application/pdf",
        "Content-Disposition":`${url.searchParams.get("preview")==="1"?"inline":"attachment"}; filename="${fileBase}.pdf"`,
        "Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
      }});
    }
    return new Response(renderSportsHouseRosterHtml(input),{status:200,headers:{
      "Content-Type":"text/html; charset=utf-8","Content-Disposition":`inline; filename="${fileBase}.html"`,
      "Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
    }});
  } catch(error) {
    console.error("[sports-houses] roster export failed",{ message:error instanceof Error ? error.message : String(error) });
    return Response.json({ error:"Unable to generate the Sports / Houses roster." },{ status:500 });
  }
}
