import { officialDocumentHeaderModeForType } from "@/features/documents/server/official-document-header";
import { getLiveSchoolDocumentHeader } from "@/features/documents/server/live-school-document-profile";
import { loadOfficialDocumentLogoBytes } from "@/features/documents/server/official-document-logo-bytes";
import {
  renderSportsHouseRosterHtml,
  renderSportsHouseRosterPdf,
  renderSportsHouseRosterXlsx,
  DEFAULT_SPORTS_HOUSE_ROSTER_COLUMNS,
  type SportsHouseRosterColumn,
  type SportsHouseRosterDocumentInput,
} from "@/features/documents/server/sports-house-roster-document";
import { getSportsHousesWorkspace } from "@/features/sports-houses/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readerRoles = new Set(["school_admin","principal","deputy_principal","hod","teacher","class_teacher"]);

const SPORTS_ROSTER_COLUMN_KEYS = new Set<SportsHouseRosterColumn>(["admission","grade","class","sex","age","age_group","source","lock"]);


function validUuid(value: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60) || "house-rosters";
}

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context.user) return Response.json({ error: "Unauthorized" },{ status:401 });
  if (context.platformMemberships.some((item)=>item.roleKey==="platform_support")) return Response.json({ error:"Permission denied" },{ status:403 });

  const url = new URL(request.url);
  const requestedSchool = url.searchParams.get("school");
  if (requestedSchool && !validUuid(requestedSchool)) return Response.json({ error:"Invalid school reference" },{ status:400 });
  const platformAdmin = context.platformMemberships.some((item)=>item.roleKey==="platform_admin");
  const requestedMembership = requestedSchool
    ? context.memberships.find((item)=>item.schoolId===requestedSchool && readerRoles.has(item.roleKey))
    : null;
  if (requestedSchool && !platformAdmin && !requestedMembership) {
    return Response.json({ error:"Permission denied" },{ status:403 });
  }
  const membership = requestedMembership ?? context.memberships.find((item)=>readerRoles.has(item.roleKey));
  const schoolId = platformAdmin && requestedSchool ? requestedSchool : membership?.schoolId;
  if (!schoolId) return Response.json({ error:"School membership required" },{ status:403 });

  const requestedYear = Number(url.searchParams.get("year"));
  const academicYear = Number.isInteger(requestedYear) && requestedYear>=2000 && requestedYear<=2200 ? requestedYear : new Date().getFullYear();
  const format = url.searchParams.get("format")==="pdf" ? "pdf" : url.searchParams.get("format")==="xlsx" ? "xlsx" : "html";
  const content: SportsHouseRosterDocumentInput["content"] = url.searchParams.get("content")==="learners" ? "learners" : url.searchParams.get("content")==="staff" ? "staff" : "combined";
  const groupByRaw = url.searchParams.get("groupBy");
  const groupBy: SportsHouseRosterDocumentInput["groupBy"] = ["age_group","sex","grade","class"].includes(groupByRaw ?? "") ? groupByRaw as "age_group"|"sex"|"grade"|"class" : "none";
  const requestedBlankColumns = Number(url.searchParams.get("blankColumns") ?? 3);
  const blankColumns = Number.isInteger(requestedBlankColumns)
    ? Math.min(6, Math.max(0, requestedBlankColumns))
    : 3;
  const requestedColumns = (url.searchParams.get("columns") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is SportsHouseRosterColumn => SPORTS_ROSTER_COLUMN_KEYS.has(value as SportsHouseRosterColumn));
  const learnerColumns = requestedColumns.length ? [...new Set(requestedColumns)] : [...DEFAULT_SPORTS_HOUSE_ROSTER_COLUMNS];

  try {
    const workspace = await getSportsHousesWorkspace(schoolId,academicYear);
    const requestedIds = new Set((url.searchParams.get("houses")??"").split(",").map((item)=>item.trim()).filter(Boolean));
    const selectedHouses = requestedIds.size ? workspace.houses.filter((house)=>requestedIds.has(house.id)) : workspace.houses.filter((house)=>house.status==="active");
    if (!selectedHouses.length) return Response.json({ error:"No valid houses were selected." },{ status:404 });
    if (requestedIds.size && selectedHouses.length!==requestedIds.size) return Response.json({ error:"A selected house is outside this school." },{ status:403 });

    const header = await getLiveSchoolDocumentHeader(schoolId,officialDocumentHeaderModeForType("sports_house_roster"));
    const generatedAt = new Intl.DateTimeFormat("en-NA",{day:"2-digit",month:"long",year:"numeric"}).format(new Date());
    const input: SportsHouseRosterDocumentInput = {
      header,
      schoolName: workspace.schoolName,
      academicYear,
      generatedAt,
      content,
      groupBy,
      blankColumns,
      learnerColumns,
      sections: selectedHouses.map((house)=>({
        house,
        learners: workspace.learners.filter((learner)=>learner.houseId===house.id),
        staff: workspace.staff.filter((person)=>person.houseId===house.id),
      })),
    };
    const fileBase=safeFilePart(`sports-house-rosters-${academicYear}-${selectedHouses.length}`);

    if(format==="xlsx"){
      const logoBytes=await loadOfficialDocumentLogoBytes(header.logoStoragePath,header.logoUrl);
      const bytes=renderSportsHouseRosterXlsx(input,logoBytes);
      return new Response(Uint8Array.from(bytes),{status:200,headers:{
        "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":`attachment; filename="${fileBase}.xlsx"`,
        "Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
      }});
    }
    if(format==="pdf"){
      const bytes=await renderSportsHouseRosterPdf(input);
      return new Response(Uint8Array.from(bytes),{status:200,headers:{
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
