import { CalendarDays, CheckCircle2, FileScan, TableProperties, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { AppBackLink } from "@/components/navigation/app-back-link";
import { AppShell } from "@/components/shell/app-shell";
import { ImportDropField, ImportStageButton } from "@/features/imports/import-drop-field";
import {
  commitOperationalIntakeJob,
  correctOperationalIntakeRow,
  reviewOperationalIntakeRow,
  stageCalendarStructuredImport,
  stageOperationalSourceArtifact,
  stageTimetableStructuredImport,
} from "@/features/imports/server/operational-intake-actions";
import { getOperationalIntakeWorkspace } from "@/features/imports/server/operational-intake-queries";
import { getUserContext } from "@/lib/auth/get-user-context";
import { getNamibiaCalendarYear } from "@/lib/namibia-date";

const leadershipRoles = new Set(["school_admin","principal","deputy_principal"]);

export default async function OperationalImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ adapter?: string; job?: string; error?: string; success?: string }>;
}) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const search = await searchParams;
  const adapter = search.adapter === "timetable" ? "timetable" : "calendar";
  const membership = context.memberships.find((item) =>
    adapter === "calendar" ? leadershipRoles.has(item.roleKey) : item.roleKey === "school_admin",
  );
  if (!membership) redirect("/");

  const year = getNamibiaCalendarYear();
  const workspace = await getOperationalIntakeWorkspace(membership.schoolId, year, adapter, search.job);
  const job = workspace.selectedJob;

  return <AppShell><div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="scolapro-page-title text-xl">Calendar & timetable intake</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Stage structured exports first; scanned/PDF sources remain private staging until extraction produces reviewable rows. Every authoritative write still passes through the existing Calendar or Timetable governance.</p>
      </div>
      <AppBackLink href="/school/imports" label="Back to bulk import" />
    </div>

    <div className="flex gap-2">
      <a href="/school/imports/operations?adapter=calendar" className={`rounded-[var(--radius-sm)] px-3 py-2 text-xs font-semibold ${adapter==="calendar"?"bg-brand text-white":"bg-surface-muted"}`}>Calendar</a>
      <a href="/school/imports/operations?adapter=timetable" className={`rounded-[var(--radius-sm)] px-3 py-2 text-xs font-semibold ${adapter==="timetable"?"bg-brand text-white":"bg-surface-muted"}`}>Timetable / aSc</a>
    </div>

    {search.error ? <div className="rounded-[var(--radius-sm)] bg-danger-soft p-3 text-xs font-medium text-[color:var(--danger)]">{search.error}</div> : null}
    {search.success ? <div className="rounded-[var(--radius-sm)] bg-success-soft p-3 text-xs font-medium text-[color:var(--success)]">{search.success}</div> : null}

    <section className="grid gap-4 lg:grid-cols-2">
      <form action={adapter==="calendar"?stageCalendarStructuredImport:stageTimetableStructuredImport} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)]">
        <div className="mb-2 flex items-center gap-2">{adapter==="calendar"?<CalendarDays className="size-4 text-brand"/>:<TableProperties className="size-4 text-brand"/>}<h2 className="scolapro-section-title">Structured import preferred</h2></div>
        <p className="mb-3 text-xs leading-5 text-muted-foreground">{adapter==="calendar"?"CSV/Excel calendar rows preserve national/regional/school/local source class and are reconciled against existing school events.":"Use a structured aSc/export mapping with teacher code, subject code, class/group, day, period, room, year and cycle/plan."}</p>
        <input type="hidden" name="academicYear" value={year}/>
        <ImportDropField inputId={`${adapter}-structured-source`} label="Choose CSV or Excel" helper="Rows stay staged until every decision is reviewed." />
        <div className="mt-3 flex items-center justify-between gap-3">
          <a href={adapter==="calendar"?"/templates/calendar-intake-template.csv":"/templates/asc-timetable-intake-template.csv"} download className="text-xs font-semibold text-brand-strong hover:underline">Download template</a>
          <ImportStageButton/>
        </div>
      </form>

      <form action={stageOperationalSourceArtifact} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)]">
        <div className="mb-2 flex items-center gap-2"><FileScan className="size-4 text-brand"/><h2 className="scolapro-section-title">Scan / OCR fallback</h2></div>
        <p className="mb-3 text-xs leading-5 text-muted-foreground">Printed PDF/image sources are retained privately with checksum provenance. They cannot commit until extraction/manual correction has produced reviewed adapter rows.</p>
        <input type="hidden" name="adapter" value={adapter}/><input type="hidden" name="academicYear" value={year}/>
        <ImportDropField inputId={`${adapter}-scan-source`} label="Drop PDF or image" helper="PDF, JPEG, PNG or WebP · 10MB maximum" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" />
        <div className="mt-3"><ImportStageButton/></div>
      </form>
    </section>

    <section className="rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Intake queue</h2><p className="scolapro-section-description">Source artifacts and row decisions remain staged audit evidence.</p></div>
      {workspace.jobs.length ? <div className="divide-y divide-border-subtle">{workspace.jobs.map((item)=>(
        <a key={item.id} href={`/school/imports/operations?adapter=${adapter}&job=${item.id}`} className={`grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center sm:px-5 ${item.id===job?.id?"bg-brand-soft/40":"hover:bg-surface-muted"}`}>
          <span className="font-semibold capitalize">{item.document_type.replaceAll("_"," ")}</span>
          <span className="text-xs capitalize text-muted-foreground">{item.source_kind.replaceAll("_"," ")}</span>
          <span className="text-xs capitalize text-muted-foreground">{item.status} · {item.extraction_status.replaceAll("_"," ")}</span>
          <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Windhoek",dateStyle:"medium"}).format(new Date(item.created_at))}</span>
        </a>
      ))}</div>:<p className="px-5 py-8 text-center text-xs text-muted-foreground">No {adapter} intake jobs yet.</p>}
    </section>

    {job ? <section className="rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
      <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div><h2 className="scolapro-section-title">Review staged rows</h2><p className="scolapro-section-description">Job {job.id.slice(0,8)} · {workspace.rows.length} rows · {workspace.pendingReviewCount} awaiting a human decision.</p></div>
        {job.status==="ready"?<form action={commitOperationalIntakeJob}><input type="hidden" name="adapter" value={adapter}/><input type="hidden" name="jobId" value={job.id}/><button className="min-h-9 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white">Commit reviewed {adapter}</button></form>:null}
      </div>

      {workspace.artifacts.length ? <div className="border-b border-border-subtle px-4 py-3 text-xs text-muted-foreground sm:px-5">Source artifacts: {workspace.artifacts.map((a)=>a.file_name).join(" · ")}</div>:null}

      {workspace.rows.length ? <div className="divide-y divide-border-subtle">{workspace.rows.map((row)=>{
        const normalized=row.normalized_payload;
        const blocked=["conflict","unmatched"].includes(row.resolution);
        return <article key={row.id} className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="text-sm font-semibold">Row {row.row_number} · <span className="capitalize">{row.resolution}</span></p><p className="mt-1 text-xs text-muted-foreground">{adapter==="calendar"?`${normalized.title??"Untitled"} · ${normalized.starts_on??"No date"}`:`${normalized.teacher_employee_number??"No teacher"} · ${normalized.subject_code??"No subject"} · ${normalized.class_code??"No class"}`}</p></div>
            <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.68rem] font-semibold ${row.review_decision==="pending"?"bg-warning-soft text-[color:var(--warning)]":"bg-success-soft text-[color:var(--success)]"}`}>{row.review_decision.replaceAll("_"," ")}</span>
          </div>

          {row.issues?.length ? <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] bg-warning-soft p-2.5 text-xs text-[color:var(--warning)]"><TriangleAlert className="mt-0.5 size-4 shrink-0"/><span>{row.issues.join(" · ")}</span></div>:null}

          <form action={correctOperationalIntakeRow} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="adapter" value={adapter}/><input type="hidden" name="jobId" value={job.id}/><input type="hidden" name="rowId" value={row.id}/>
            {adapter==="calendar"?<>
              <Field name="title" label="Title" value={normalized.title}/><Field name="category" label="Category" value={normalized.category}/>
              <Field name="starts_on" label="Start date" value={normalized.starts_on}/><Field name="ends_on" label="End date" value={normalized.ends_on}/>
              <Field name="starts_at" label="Start time" value={normalized.starts_at}/><Field name="ends_at" label="End time" value={normalized.ends_at}/>
              <Field name="source_class" label="Source class" value={normalized.source_class}/><Field name="teaching_impact" label="Teaching impact" value={normalized.teaching_impact}/>
              <Field name="audience_scope" label="Audience scope" value={normalized.audience_scope}/><Field name="audience_reference_id" label="Audience reference" value={normalized.audience_reference_id}/>
              <Field name="bell_schedule_id" label="Bell schedule ID" value={normalized.bell_schedule_id}/><Field name="description" label="Description" value={normalized.description}/>
            </>:<>
              <Field name="teacher_employee_number" label="Teacher code" value={normalized.teacher_employee_number}/><Field name="subject_code" label="Subject code" value={normalized.subject_code}/>
              <Field name="class_code" label="Class" value={normalized.class_code}/><Field name="group_code" label="Group" value={normalized.group_code}/>
              <Field name="weekday" label="Day" value={normalized.weekday}/><Field name="period_number" label="Period" value={normalized.period_number}/>
              <Field name="room_label" label="Room" value={normalized.room_label}/><Field name="cycle_code" label="Plan / cycle" value={normalized.cycle_code}/>
            </>}
            <div className="sm:col-span-2 lg:col-span-4"><button className="min-h-8 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-semibold">Save correction & re-check</button></div>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {row.review_decision==="pending" && !blocked && row.resolution==="create"?<Decision rowId={row.id} jobId={job.id} adapter={adapter} decision="create" label="Approve create"/>:null}
            {row.review_decision==="pending" && !blocked && row.resolution==="update"?<Decision rowId={row.id} jobId={job.id} adapter={adapter} decision="update" label="Approve update"/>:null}
            {row.review_decision==="pending"?<Decision rowId={row.id} jobId={job.id} adapter={adapter} decision="ignore" label="Ignore row"/>:null}
            {row.review_decision!=="pending"?<span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--success)]"><CheckCircle2 className="size-3.5"/>Reviewed</span>:null}
          </div>
        </article>;
      })}</div>:<div className="px-5 py-8 text-center text-xs text-muted-foreground">{job.source_kind==="structured_import"?"No staged rows found.":"Source retained; extraction has not produced reviewable rows yet."}</div>}
    </section>:null}
  </div></AppShell>;
}

function Field({name,label,value}:{name:string;label:string;value:unknown}) {
  return <label className="text-[0.68rem] font-medium text-muted-foreground"><span className="mb-1 block">{label}</span><input name={name} defaultValue={value==null?"":String(value)} className="min-h-9 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-xs text-foreground"/></label>;
}

function Decision({rowId,jobId,adapter,decision,label}:{rowId:string;jobId:string;adapter:string;decision:string;label:string}) {
  return <form action={reviewOperationalIntakeRow}><input type="hidden" name="rowId" value={rowId}/><input type="hidden" name="jobId" value={jobId}/><input type="hidden" name="adapter" value={adapter}/><input type="hidden" name="decision" value={decision}/><button className="min-h-8 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong">{label}</button></form>;
}
