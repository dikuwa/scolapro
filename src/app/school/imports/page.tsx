import type { ReactNode } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, Download, HeartHandshake, Link2, RotateCcw, SkipForward, Trash2, Upload, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { CompactActionButton, CompactActionLink } from "@/components/ui/compact-action";
import { ImportDropField } from "@/features/imports/import-drop-field";
import { commitAcademicStructureImport, stageAcademicStructureCsv } from "@/features/imports/server/academic-actions";
import { archiveImportBatch, commitLearnerImport, commitStaffImport, discardImportBatch, markLearnerImportReady, skipMatchedImportRow, stageLearnerCsv, stageStaffCsv } from "@/features/imports/server/actions";
import { commitGuardianImport, confirmMatchedGuardianImportRow, stageGuardianCsv } from "@/features/imports/server/guardian-actions";
import { getImportWorkspace } from "@/features/imports/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

const interactiveButton = "cursor-pointer transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft active:translate-y-px";

export default async function SchoolImportsPage({ searchParams }: { searchParams: Promise<{ batch?: string; error?: string; success?: string; history?: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships[0];
  if (!membership || membership.roleKey !== "school_admin") redirect("/");

  const search = await searchParams;
  const showHistory = search.history === "1";
  const workspace = await getImportWorkspace(membership.schoolId, search.batch, showHistory);
  const batch = workspace.selectedBatch;
  const unresolvedRows = workspace.rows.filter((row) => row.resolution === "review" || row.resolution === "error").length;
  const isStaff = batch?.import_type === "staff";
  const isAcademic = batch?.import_type === "academic_structure";
  const isGuardian = batch?.import_type === "guardians";
  const commitAction = isStaff ? commitStaffImport : isAcademic ? commitAcademicStructureImport : isGuardian ? commitGuardianImport : commitLearnerImport;
  const commitLabel = isStaff ? "staff" : isAcademic ? "academic structure" : isGuardian ? "guardians" : "learners";

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="scolapro-page-title text-xl">Bulk import</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use a ScolaPro template or bring an existing CSV/Excel file. Files are staged first, checked against stable identifiers and school setup, then committed only after review.</p>
        </div>

        {search.error ? <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] bg-danger-soft p-3 text-xs font-medium text-[color:var(--danger)] sm:flex-row sm:items-center sm:justify-between"><span>{search.error}</span><a href="/school/imports" className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-[var(--radius-xs)] bg-surface px-2.5 text-foreground shadow-[var(--shadow-xs)] transition-colors hover:bg-surface-muted sm:self-auto"><RotateCcw className="size-3.5" />Start over</a></div> : null}
        {search.success ? <div className="rounded-[var(--radius-sm)] bg-success-soft p-3 text-xs font-medium text-[color:var(--success)]">{search.success}</div> : null}

        <section className="grid items-stretch gap-5 xl:grid-cols-2 2xl:grid-cols-4">
          <ImportCard icon={<Upload className="size-4" />} tone="scolapro-tone-mint" title="Stage learner file" description="Required: first_names, surname, grade_code, class_code. Optional identity fields include initials and preferred_name; keep initials out of first_names." inputId="learner-csv" label="Choose learner CSV or Excel" helper="CSV, XLSX or XLS up to 5 MB. Drag and drop or click to browse." button="Stage and reconcile learners" action={stageLearnerCsv} templateHref="/templates/learner-import-template.csv" />
          <ImportCard icon={<UsersRound className="size-4" />} tone="scolapro-tone-sky" title="Stage staff file" description="Required: employee_number, first_name, last_name. Optional: initials, assignment_type, position_title and effective_from." inputId="staff-csv" label="Choose staff CSV or Excel" helper="CSV, XLSX or XLS up to 5 MB. Staff are staged before any account invitation is created." button="Stage and reconcile staff" action={stageStaffCsv} templateHref="/templates/staff-import-template.csv" />
          <ImportCard icon={<HeartHandshake className="size-4" />} tone="scolapro-tone-mint" title="Stage guardian file" description="Required: learner_admission_number, identity_number, first_names, surname. Optional initials, contacts and relationship flags are supported. Repeat a learner for multiple guardians or a guardian for multiple learners." inputId="guardian-csv" label="Choose guardian CSV or Excel" helper="CSV, XLSX or XLS up to 5 MB. Matching uses guardian identity and learner admission numbers." button="Stage and reconcile guardians" action={stageGuardianCsv} templateHref="/templates/guardian-import-template.csv" />
          <ImportCard icon={<BookOpenCheck className="size-4" />} tone="scolapro-tone-brand" title="Stage academic structure" description="Rows use record_type grade/class/subject, code and display_name. Class rows also require grade_code." inputId="academic-csv" label="Choose structure CSV or Excel" helper="CSV, XLSX or XLS up to 5 MB. Grades are committed before classes in the same batch." button="Stage and reconcile structure" action={stageAcademicStructureCsv} templateHref="/templates/academic-structure-import-template.csv" />
        </section>

        <section className="bg-surface shadow-[var(--shadow-xs)]">
          <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <div><h2 className="scolapro-section-title">{showHistory ? "Import history" : "Recent import batches"}</h2><p className="scolapro-section-description">Open batches can be cancelled. Completed, cancelled or failed batches can be archived to reduce clutter without deleting their audit history.</p></div>
            <CompactActionLink href={showHistory ? "/school/imports" : "/school/imports?history=1"} className="shrink-0">{showHistory ? "Show recent only" : "Show archived history"}</CompactActionLink>
          </div>
          {workspace.batches.length ? <div className="divide-y divide-border-subtle">{workspace.batches.map((item) => {
            const terminal = ["completed", "cancelled", "failed"].includes(item.status);
            const canCancel = !["completed", "committing", "cancelled", "failed"].includes(item.status);
            const archived = Boolean(item.archived_at);
            const detailHref = `/school/imports?batch=${item.id}${showHistory ? "&history=1" : ""}`;
            const statusTone = archived ? "neutral" : item.status === "completed" ? "success" : item.status === "cancelled" || item.status === "failed" ? "danger" : "brand";
            return <div key={item.id} className={`flex flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between sm:px-5 ${batch?.id === item.id ? "bg-brand-soft/45" : "hover:bg-surface-muted/60"}`}>
              <a href={detailHref} className="min-w-0 flex-1 rounded-[var(--radius-xs)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"><span className="scolapro-record-title block truncate">{item.source_file_name}</span><span className="text-[0.68rem] capitalize text-muted-foreground">{item.import_type.replaceAll("_", " ")} · {item.total_rows} rows · {item.valid_rows} resolved · {item.error_rows} errors</span></a>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <CompactActionLink href={detailHref} tone={statusTone} className="capitalize">{archived ? `Archived · ${item.status}` : item.status}</CompactActionLink>
                {!archived && canCancel ? <form action={discardImportBatch}><input type="hidden" name="batchId" value={item.id} /><CompactActionButton type="submit" tone="danger">Cancel</CompactActionButton></form> : null}
                {!archived && terminal ? <form action={archiveImportBatch}><input type="hidden" name="batchId" value={item.id} /><CompactActionButton type="submit" tone="warning">Archive</CompactActionButton></form> : null}
              </div>
            </div>;
          })}</div> : <div className="p-8 text-center text-xs text-muted-foreground">{showHistory ? "No import history found." : "No active or recent imports."}</div>}
        </section>

        {batch ? <section className="bg-surface shadow-[var(--shadow-xs)]">
          <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div><h2 className="scolapro-section-title">Review · {batch.source_file_name}</h2><p className="scolapro-section-description capitalize">{batch.import_type.replaceAll("_", " ")} · {batch.total_rows} rows · {batch.valid_rows} resolved · {batch.warning_rows} warnings · {batch.error_rows} errors{unresolvedRows ? ` · ${unresolvedRows} require review` : ""}</p></div>
            <div className="flex flex-wrap gap-2">
              {!(["completed", "committing", "cancelled", "failed"] as string[]).includes(batch.status) ? <form action={discardImportBatch}><input type="hidden" name="batchId" value={batch.id} /><button className={`${interactiveButton} inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-danger-soft px-3 text-xs font-semibold text-[color:var(--danger)] hover:bg-[color:var(--danger)] hover:text-white`}><Trash2 className="size-3.5" />Discard and start over</button></form> : null}
              {batch.status === "review" && unresolvedRows === 0 ? <form action={markLearnerImportReady}><input type="hidden" name="batchId" value={batch.id} /><button className={`${interactiveButton} min-h-9 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong hover:bg-brand hover:text-white`}>Mark ready</button></form> : null}
              {batch.status === "ready" ? <form action={commitAction}><input type="hidden" name="batchId" value={batch.id} /><button className={`${interactiveButton} min-h-9 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white hover:brightness-95`}>Commit {commitLabel}</button></form> : null}
              {!batch.archived_at && ["completed", "cancelled", "failed"].includes(batch.status) ? <form action={archiveImportBatch}><input type="hidden" name="batchId" value={batch.id} /><button className={`${interactiveButton} min-h-9 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-semibold text-muted-foreground hover:bg-foreground hover:text-background`}>Archive from recent list</button></form> : null}
            </div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[56rem] border-collapse text-left text-xs"><thead className="bg-surface-muted text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Row</th><th className="px-4 py-2 font-medium">{isStaff ? "Staff member" : isAcademic ? "Configuration" : isGuardian ? "Guardian" : "Learner"}</th><th className="px-4 py-2 font-medium">{isStaff ? "School assignment" : isAcademic ? "Scope" : isGuardian ? "Learner relationship" : "Placement"}</th><th className="px-4 py-2 font-medium">Resolution</th><th className="px-4 py-2 font-medium">Issues</th><th className="px-4 py-2 font-medium">Action</th></tr></thead><tbody className="divide-y divide-border-subtle">{workspace.rows.map((row) => {
            const issues = row.issues ?? [];
            const ready = ["create", "update", "link", "skip"].includes(row.resolution);
            const guardianReview = isGuardian && row.resolution === "review" && row.matched_entity_type === "guardian" && row.matched_entity_id;
            return <tr key={row.id}><td className="px-4 py-2.5 text-muted-foreground">{row.row_number}</td><td className="px-4 py-2.5">{renderPrimaryCell(row.normalized_data, isStaff, isAcademic, isGuardian)}</td><td className="px-4 py-2.5 text-muted-foreground">{renderScopeCell(row.source_data, row.normalized_data, isStaff, isAcademic, isGuardian)}</td><td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-2 py-1 font-medium ${row.resolution === "create" || row.resolution === "link" ? "bg-success-soft text-[color:var(--success)]" : row.resolution === "skip" ? "bg-surface-muted text-muted-foreground" : row.resolution === "update" ? "bg-brand-soft text-brand-strong" : "bg-warning-soft text-[color:var(--warning)]"}`}>{ready ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}{row.resolution}</span></td><td className="px-4 py-2.5 text-[0.68rem] text-muted-foreground">{issues.length ? issues.map((issue) => issue.message).join(" · ") : "Ready"}</td><td className="px-4 py-2.5">{guardianReview ? <div className="flex flex-wrap gap-1.5"><form action={confirmMatchedGuardianImportRow}><input type="hidden" name="rowId" value={row.id} /><input type="hidden" name="batchId" value={batch.id} /><input type="hidden" name="guardianId" value={row.matched_entity_id ?? ""} /><button type="submit" className={`${interactiveButton} inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.68rem] font-semibold text-brand-strong hover:bg-brand hover:text-white`}><Link2 className="size-3.5" />Use existing guardian</button></form><form action={skipMatchedImportRow}><input type="hidden" name="rowId" value={row.id} /><input type="hidden" name="batchId" value={batch.id} /><button type="submit" className={`${interactiveButton} inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-[0.68rem] font-semibold text-muted-foreground hover:bg-surface-elevated hover:text-foreground`}><SkipForward className="size-3.5" />Skip row</button></form></div> : row.resolution === "review" && row.matched_entity_id ? <form action={skipMatchedImportRow}><input type="hidden" name="rowId" value={row.id} /><input type="hidden" name="batchId" value={batch.id} /><button type="submit" className={`${interactiveButton} inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-[0.68rem] font-semibold text-muted-foreground hover:bg-surface-elevated hover:text-foreground`}><SkipForward className="size-3.5" />Skip matched row</button></form> : <span className="text-[0.68rem] text-muted-foreground">—</span>}</td></tr>;
          })}</tbody></table></div>
        </section> : null}
      </div>
    </AppShell>
  );
}

function ImportCard({ icon, tone, title, description, inputId, label, helper, button, action, templateHref }: { icon: ReactNode; tone: string; title: string; description: string; inputId: string; label: string; helper: string; button: string; action: (formData: FormData) => void | Promise<void>; templateHref: string }) {
  return <div className="flex h-full flex-col bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <div className="flex items-start gap-3"><span className={`${tone} grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]`}>{icon}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h2 className="scolapro-section-title">{title}</h2><a href={templateHref} download className="inline-flex shrink-0 items-center gap-1 text-[0.68rem] font-semibold text-brand-strong transition-colors hover:text-brand hover:underline"><Download className="size-3.5" />Template</a></div><p className="scolapro-section-description">{description}</p></div></div>
    <form action={action} className="mt-4 flex flex-1 flex-col"><ImportDropField inputId={inputId} label={label} helper={helper} /><div className="mt-auto pt-3"><button type="submit" className={`${interactiveButton} inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white hover:brightness-95`}>{button}</button></div></form>
  </div>;
}

function renderPrimaryCell(data: Record<string, string>, isStaff: boolean, isAcademic: boolean, isGuardian: boolean) {
  const initials = data.initials ? ` · ${data.initials}` : "";
  if (isStaff) return <><span className="font-medium">{data.first_name} {data.last_name}</span><span className="mt-0.5 block text-[0.68rem] text-muted-foreground">{data.employee_number || "No employee number"}{initials}</span></>;
  if (isAcademic) return <><span className="font-medium capitalize">{data.record_type} · {data.code}</span><span className="mt-0.5 block text-[0.68rem] text-muted-foreground">{data.display_name}</span></>;
  if (isGuardian) return <><span className="font-medium">{data.first_names} {data.surname}</span><span className="mt-0.5 block text-[0.68rem] text-muted-foreground">ID {data.identity_number || "—"}{initials}</span></>;
  return <><span className="font-medium">{data.first_names} {data.surname}</span>{data.admission_number || data.initials ? <span className="mt-0.5 block text-[0.68rem] text-muted-foreground">{data.admission_number || "No admission number"}{initials}</span> : null}</>;
}

function renderScopeCell(source: Record<string, string>, data: Record<string, string>, isStaff: boolean, isAcademic: boolean, isGuardian: boolean) {
  if (isStaff) return `${data.assignment_type || "staff"}${data.position_title ? ` · ${data.position_title}` : ""}`;
  if (isAcademic) return `${data.academic_year || "—"}${data.record_type === "class" ? ` · grade ${data.grade_code || "—"}` : ""}`;
  if (isGuardian) return `${data.learner_admission_number || "—"} · ${(data.relationship_type || "guardian").replaceAll("_", " ")}`;
  return `${source.grade_code || source.grade || "—"} · ${source.class_code || source.register_class || source.class || "—"}`;
}