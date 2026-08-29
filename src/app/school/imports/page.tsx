import type { ReactNode } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, Download, HeartHandshake, Link2, RotateCcw, SkipForward, Trash2, Upload, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ImportDropField } from "@/features/imports/import-drop-field";
import { commitAcademicStructureImport, stageAcademicStructureCsv } from "@/features/imports/server/academic-actions";
import { commitLearnerImport, commitStaffImport, discardImportBatch, markLearnerImportReady, skipMatchedImportRow, stageLearnerCsv, stageStaffCsv } from "@/features/imports/server/actions";
import { commitGuardianImport, confirmMatchedGuardianImportRow, stageGuardianCsv } from "@/features/imports/server/guardian-actions";
import { getImportWorkspace } from "@/features/imports/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

export default async function SchoolImportsPage({ searchParams }: { searchParams: Promise<{ batch?: string; error?: string; success?: string }> }) {
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships[0];
  if (!membership || membership.roleKey !== "school_admin") redirect("/");

  const search = await searchParams;
  const workspace = await getImportWorkspace(membership.schoolId, search.batch);
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

        {search.error ? <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] bg-danger-soft p-3 text-xs font-medium text-[color:var(--danger)] sm:flex-row sm:items-center sm:justify-between"><span>{search.error}</span><a href="/school/imports" className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-[var(--radius-xs)] bg-surface px-2.5 text-foreground shadow-[var(--shadow-xs)] sm:self-auto"><RotateCcw className="size-3.5" />Start over</a></div> : null}
        {search.success ? <div className="rounded-[var(--radius-sm)] bg-success-soft p-3 text-xs font-medium text-[color:var(--success)]">{search.success}</div> : null}

        <section className="grid items-stretch gap-5 xl:grid-cols-2 2xl:grid-cols-4">
          <ImportCard icon={<Upload className="size-4" />} tone="scolapro-tone-mint" title="Stage learner file" description="Required: first_names, surname, grade_code, class_code. Stable identifiers: admission_number, national_id, birth_certificate_number." inputId="learner-csv" label="Choose learner CSV or Excel" helper="CSV, XLSX or XLS up to 5 MB. Drag and drop or click to browse." button="Stage and reconcile learners" action={stageLearnerCsv} templateHref="/templates/learner-import-template.csv" />
          <ImportCard icon={<UsersRound className="size-4" />} tone="scolapro-tone-sky" title="Stage staff file" description="Required: employee_number, first_name, last_name. Optional: assignment_type, position_title, effective_from." inputId="staff-csv" label="Choose staff CSV or Excel" helper="CSV, XLSX or XLS up to 5 MB. Staff are staged before any account invitation is created." button="Stage and reconcile staff" action={stageStaffCsv} templateHref="/templates/staff-import-template.csv" />
          <ImportCard icon={<HeartHandshake className="size-4" />} tone="scolapro-tone-mint" title="Stage guardian file" description="Required: learner_admission_number, identity_number, first_names, surname. Optional contacts and relationship flags are supported." inputId="guardian-csv" label="Choose guardian CSV or Excel" helper="CSV, XLSX or XLS up to 5 MB. Matching uses guardian identity and learner admission numbers." button="Stage and reconcile guardians" action={stageGuardianCsv} templateHref="/templates/guardian-import-template.csv" />
          <ImportCard icon={<BookOpenCheck className="size-4" />} tone="scolapro-tone-brand" title="Stage academic structure" description="Rows use record_type grade/class/subject, code and display_name. Class rows also require grade_code." inputId="academic-csv" label="Choose structure CSV or Excel" helper="CSV, XLSX or XLS up to 5 MB. Grades are committed before classes in the same batch." button="Stage and reconcile structure" action={stageAcademicStructureCsv} templateHref="/templates/academic-structure-import-template.csv" />
        </section>

        <section className="bg-surface shadow-[var(--shadow-xs)]">
          <div className="border-b border-border-subtle px-4 py-4 sm:px-5"><h2 className="scolapro-section-title">Recent import batches</h2><p className="scolapro-section-description">Staging is reversible. Nothing enters an operational register, relationship record, staff directory or academic setup until a ready batch is committed.</p></div>
          {workspace.batches.length ? <div className="divide-y divide-border-subtle">{workspace.batches.map((item) => <a key={item.id} href={`/school/imports?batch=${item.id}`} className={`flex items-center justify-between gap-3 px-4 py-3 sm:px-5 ${batch?.id === item.id ? "bg-brand-soft/45" : "hover:bg-surface-muted"}`}><span className="min-w-0"><span className="scolapro-record-title block truncate">{item.source_file_name}</span><span className="text-[0.68rem] capitalize text-muted-foreground">{item.import_type.replaceAll("_", " ")} · {item.total_rows} rows · {item.valid_rows} resolved · {item.error_rows} errors</span></span><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.65rem] font-medium capitalize text-muted-foreground">{item.status}</span></a>)}</div> : <div className="p-8 text-center text-xs text-muted-foreground">No imports staged yet.</div>}
        </section>

        {batch ? <section className="bg-surface shadow-[var(--shadow-xs)]">
          <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div><h2 className="scolapro-section-title">Review · {batch.source_file_name}</h2><p className="scolapro-section-description capitalize">{batch.import_type.replaceAll("_", " ")} · {batch.total_rows} rows · {batch.valid_rows} resolved · {batch.warning_rows} warnings · {batch.error_rows} errors{unresolvedRows ? ` · ${unresolvedRows} require review` : ""}</p></div>
            <div className="flex flex-wrap gap-2">
              {!(["completed", "committing", "cancelled"] as string[]).includes(batch.status) ? <form action={discardImportBatch}><input type="hidden" name="batchId" value={batch.id} /><button className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-danger-soft px-3 text-xs font-semibold text-[color:var(--danger)]"><Trash2 className="size-3.5" />Discard and start over</button></form> : null}
              {batch.status === "review" && unresolvedRows === 0 ? <form action={markLearnerImportReady}><input type="hidden" name="batchId" value={batch.id} /><button className="min-h-9 rounded-[var(--radius-sm)] bg-brand-soft px-3 text-xs font-semibold text-brand-strong">Mark ready</button></form> : null}
              {batch.status === "ready" ? <form action={commitAction}><input type="hidden" name="batchId" value={batch.id} /><button className="min-h-9 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white">Commit {commitLabel}</button></form> : null}
            </div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[56rem] border-collapse text-left text-xs"><thead className="bg-surface-muted text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Row</th><th className="px-4 py-2 font-medium">{isStaff ? "Staff member" : isAcademic ? "Configuration" : isGuardian ? "Guardian" : "Learner"}</th><th className="px-4 py-2 font-medium">{isStaff ? "School assignment" : isAcademic ? "Scope" : isGuardian ? "Learner relationship" : "Placement"}</th><th className="px-4 py-2 font-medium">Resolution</th><th className="px-4 py-2 font-medium">Issues</th><th className="px-4 py-2 font-medium">Action</th></tr></thead><tbody className="divide-y divide-border-subtle">{workspace.rows.map((row) => {
            const issues = row.issues ?? [];
            const ready = ["create", "update", "link", "skip"].includes(row.resolution);
            const guardianReview = isGuardian && row.resolution === "review" && row.matched_entity_type === "guardian" && row.matched_entity_id;
            return <tr key={row.id}><td className="px-4 py-2.5 text-muted-foreground">{row.row_number}</td><td className="px-4 py-2.5">{renderPrimaryCell(row.normalized_data, isStaff, isAcademic, isGuardian)}</td><td className="px-4 py-2.5 text-muted-foreground">{renderScopeCell(row.source_data, row.normalized_data, isStaff, isAcademic, isGuardian)}</td><td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-2 py-1 font-medium ${row.resolution === "create" || row.resolution === "link" ? "bg-success-soft text-[color:var(--success)]" : row.resolution === "skip" ? "bg-surface-muted text-muted-foreground" : row.resolution === "update" ? "bg-brand-soft text-brand-strong" : "bg-warning-soft text-[color:var(--warning)]"}`}>{ready ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}{row.resolution}</span></td><td className="px-4 py-2.5 text-[0.68rem] text-muted-foreground">{issues.length ? issues.map((issue) => issue.message).join(" · ") : "Ready"}</td><td className="px-4 py-2.5">{guardianReview ? <div className="flex flex-wrap gap-1.5"><form action={confirmMatchedGuardianImportRow}><input type="hidden" name="rowId" value={row.id} /><input type="hidden" name="batchId" value={batch.id} /><input type="hidden" name="guardianId" value={row.matched_entity_id ?? ""} /><button type="submit" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.68rem] font-semibold text-brand-strong"><Link2 className="size-3.5" />Use existing guardian</button></form><form action={skipMatchedImportRow}><input type="hidden" name="rowId" value={row.id} /><input type="hidden" name="batchId" value={batch.id} /><button type="submit" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-[0.68rem] font-semibold text-muted-foreground hover:text-foreground"><SkipForward className="size-3.5" />Skip row</button></form></div> : row.resolution === "review" && row.matched_entity_id ? <form action={skipMatchedImportRow}><input type="hidden" name="rowId" value={row.id} /><input type="hidden" name="batchId" value={batch.id} /><button type="submit" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 text-[0.68rem] font-semibold text-muted-foreground hover:text-foreground"><SkipForward className="size-3.5" />Skip matched row</button></form> : <span className="text-[0.68rem] text-muted-foreground">—</span>}</td></tr>;
          })}</tbody></table></div>
        </section> : null}
      </div>
    </AppShell>
  );
}

function ImportCard({ icon, tone, title, description, inputId, label, helper, button, action, templateHref }: { icon: ReactNode; tone: string; title: string; description: string; inputId: string; label: string; helper: string; button: string; action: (formData: FormData) => void | Promise<void>; templateHref: string }) {
  return <div className="flex h-full flex-col bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <div className="flex items-start gap-3"><span className={`${tone} grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]`}>{icon}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h2 className="scolapro-section-title">{title}</h2><a href={templateHref} download className="inline-flex shrink-0 items-center gap-1 text-[0.68rem] font-semibold text-brand-strong hover:underline"><Download className="size-3.5" />Template</a></div><p className="scolapro-section-description">{description}</p></div></div>
    <form action={action} className="mt-4 flex flex-1 flex-col"><ImportDropField inputId={inputId} label={label} helper={helper} /><div className="mt-auto pt-3"><button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-white">{button}</button></div></form>
  </div>;
}

function renderPrimaryCell(data: Record<string, string>, isStaff: boolean, isAcademic: boolean, isGuardian: boolean) {
  if (isStaff) return <><span className="font-medium">{data.first_name} {data.last_name}</span><span className="mt-0.5 block text-[0.68rem] text-muted-foreground">{data.employee_number || "No employee number"}</span></>;
  if (isAcademic) return <><span className="font-medium capitalize">{data.record_type} · {data.code}</span><span className="mt-0.5 block text-[0.68rem] text-muted-foreground">{data.display_name}</span></>;
  if (isGuardian) return <><span className="font-medium">{data.first_names} {data.surname}</span><span className="mt-0.5 block text-[0.68rem] text-muted-foreground">ID {data.identity_number || "—"}</span></>;
  return <><span className="font-medium">{data.first_names} {data.surname}</span>{data.admission_number ? <span className="mt-0.5 block text-[0.68rem] text-muted-foreground">{data.admission_number}</span> : null}</>;
}

function renderScopeCell(source: Record<string, string>, data: Record<string, string>, isStaff: boolean, isAcademic: boolean, isGuardian: boolean) {
  if (isStaff) return `${data.assignment_type || "staff"}${data.position_title ? ` · ${data.position_title}` : ""}`;
  if (isAcademic) return `${data.academic_year || "—"}${data.record_type === "class" ? ` · grade ${data.grade_code || "—"}` : ""}`;
  if (isGuardian) return `${data.learner_admission_number || "—"} · ${(data.relationship_type || "guardian").replaceAll("_", " ")}`;
  return `${source.grade_code || source.grade || "—"} · ${source.class_code || source.register_class || source.class || "—"}`;
}
