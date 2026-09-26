import Link from "next/link";
import { ArrowLeft, ArrowUpRight, LockKeyhole, PencilLine } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getMarkGridQueue } from "@/features/assessment/server/mark-grid";

export default async function AssessmentMarksPage() {
  const rows=await getMarkGridQueue();
  if (!rows) redirect("/assessment");

  return (
    <AppShell>
      <section>
        <Link href="/assessment" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Assessment</Link>
        <div className="mb-6">
          <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">Marks entry</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Open and returned assessments remain editable. Review, verified and locked assessments are available as read-only evidence.</p>
        </div>
        <div className="space-y-3">
          {rows.length ? rows.map((row)=><Link key={row.id} href={`/assessment/marks/${row.id}`} className="group flex flex-col gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] transition hover:border-border sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">{["open","returned"].includes(row.status) ? <PencilLine className="mt-0.5 size-5 shrink-0 text-brand"/> : <LockKeyhole className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}<div className="min-w-0"><p className="truncate text-sm font-semibold">{row.subject} · {row.className}</p><p className="mt-1 text-xs text-muted-foreground">{row.assessmentName}{row.rawMax!=null ? ` · Max ${row.rawMax}` : ""}{row.termNumber ? ` · Term ${row.termNumber}` : ""} · <span className="capitalize">{row.status.replaceAll("_"," ")}</span></p></div></div>
            <span className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-brand-strong sm:self-auto">Open grid<ArrowUpRight className="size-4"/></span>
          </Link>) : <div className="rounded-[var(--radius-md)] bg-surface-muted p-6 text-sm text-muted-foreground">No assessment instances are currently available in your scope.</div>}
        </div>
      </section>
    </AppShell>
  );
}
