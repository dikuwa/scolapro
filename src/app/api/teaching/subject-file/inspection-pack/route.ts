import { NextResponse } from "next/server";
import { getGovernedAcademicYear } from "@/features/calendar/server/calendar";
import { getSubjectFileRow } from "@/features/teaching/server/subject-file";
import { getUserContext } from "@/lib/auth/get-user-context";

function escapeHtml(value:string) {
  return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

export async function GET(request:Request) {
  const context=await getUserContext();
  const membership=context.currentSchoolMembership;
  if (!context.user || context.platformMemberships.length || !membership) {
    return NextResponse.json({message:"Not authorized."},{status:403});
  }
  const url=new URL(request.url);
  const subjectId=url.searchParams.get("subjectId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(subjectId)) return NextResponse.json({message:"Subject is required."},{status:400});

  const academicYear=await getGovernedAcademicYear(membership.schoolId);
  const result=await getSubjectFileRow(academicYear,subjectId);
  if (!result) return NextResponse.json({message:"Subject File is outside your current governed scope."},{status:404});

  const {workspace,row}=result;
  const sourceRows=row.sourceLinks.map((item)=>\`<tr><td>\${escapeHtml(item.label)}</td><td>\${escapeHtml(item.description)}</td></tr>\`).join("");
  const teacherRows=row.teacherNames.map((name)=>\`<li>\${escapeHtml(name)}</li>\`).join("") || "<li>No current teacher allocation recorded</li>";
  const gaps=row.unavailableSources.map((item)=>\`<li>\${escapeHtml(item)}</li>\`).join("");

  const html=\`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>\${escapeHtml(row.subjectName)} Subject File</title>
<style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#161616;margin:0;font-size:11px;line-height:1.45}
header{border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:14px}.school{font-size:18px;font-weight:700}.muted{color:#666}
h1{font-size:20px;margin:10px 0 2px}h2{font-size:13px;margin:18px 0 7px;border-bottom:1px solid #bbb;padding-bottom:4px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.metric{border:1px solid #ccc;padding:8px}.metric b{display:block;font-size:18px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{background:#f1f1f1}
ul{margin:6px 0;padding-left:20px}.footer{margin-top:20px;border-top:1px solid #bbb;padding-top:8px;font-size:9px;color:#666}
.no-print{margin-bottom:12px}@media print{.no-print{display:none}}
</style></head><body>
<div class="no-print"><button onclick="window.print()">Print / Save PDF</button></div>
<header><div class="school">\${escapeHtml(workspace.schoolName)}</div><div class="muted">ScolaPro dynamic Subject File · \${academicYear}</div></header>
<h1>\${escapeHtml(row.subjectName)}</h1>
<div class="muted">\${escapeHtml(row.subjectCode)}\${row.departmentLabel ? " · "+escapeHtml(row.departmentLabel):""} · \${row.accessMode==="hod"?"HOD portfolio":"Teacher read access"}</div>
<h2>Current evidence summary</h2>
<div class="grid">
<div class="metric"><span>Teaching team</span><b>\${row.teacherNames.length}</b></div>
<div class="metric"><span>Plans / schedules</span><b>\${row.planningCount} / \${row.scheduledLessonCount}</b></div>
<div class="metric"><span>Preparations</span><b>\${row.preparationCount}</b></div>
<div class="metric"><span>Assessments / moderation</span><b>\${row.assessmentInstanceCount} / \${row.moderationRequiredCount}</b></div>
</div>
<h2>Grades</h2><p>\${escapeHtml(row.gradeNames.join(", ") || "No current grades")}</p>
<h2>Teaching team</h2><ul>\${teacherRows}</ul>
<h2>Authoritative source register</h2>
<table><thead><tr><th>Source module</th><th>Evidence</th></tr></thead><tbody>\${sourceRows}</tbody></table>
<h2>Explicit source gaps</h2><ul>\${gaps}</ul>
<div class="footer">Generated from live ScolaPro source records. This inspection pack is a read-only dossier and does not create duplicate mutable records.</div>
</body></html>\`;

  return new NextResponse(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"private, no-store"}});
}
