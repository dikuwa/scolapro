import Link from "next/link";
import { FileCheck2, Search } from "lucide-react";
import type { ReportCardStatusFilter, ReportCardStatusPage } from "@/features/reporting/server/paged-report-cards";

const statusOptions: Array<{ value: ReportCardStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "not_generated", label: "Not generated" },
  { value: "generated", label: "Generated" },
  { value: "certified", label: "Certified" },
  { value: "published", label: "Published" },
];

const statusLabels: Record<Exclude<ReportCardStatusFilter, "all">, string> = {
  not_generated: "Not generated",
  generated: "Generated",
  certified: "Certified",
  published: "Published",
};

const statusClasses: Record<Exclude<ReportCardStatusFilter, "all">, string> = {
  not_generated: "bg-surface-muted text-muted-foreground",
  generated: "bg-warning-soft text-[color:var(--warning)]",
  certified: "bg-success-soft text-[color:var(--success)]",
  published: "bg-brand-soft text-brand-strong",
};

type Props = {
  statusPage: ReportCardStatusPage;
  termNumber: number;
  query: string;
  status: ReportCardStatusFilter;
};

function buildHref(input: { page: number; termNumber: number; query: string; status: ReportCardStatusFilter }) {
  const params = new URLSearchParams();
  params.set("term", String(input.termNumber));
  if (input.query) params.set("q", input.query);
  if (input.status !== "all") params.set("status", input.status);
  if (input.page > 1) params.set("page", String(input.page));
  return `/reports/report-cards?${params.toString()}`;
}

export function ReportCardStatusReadonly({ statusPage, termNumber, query, status }: Props) {
  const start = statusPage.totalCount === 0 ? 0 : (statusPage.page - 1) * statusPage.pageSize + 1;
  const end = Math.min(statusPage.totalCount, start + statusPage.rows.length - 1);

  return <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
    <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="scolapro-section-title">Current learner reports</h2>
          <p className="scolapro-section-description">Server-filtered status view. Only the current 50-row page is loaded.</p>
        </div>
        <p className="text-xs font-semibold">{statusPage.totalCount} learner{statusPage.totalCount === 1 ? "" : "s"}</p>
      </div>
      <form method="get" className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_9rem_11rem_auto]">
        <label className="relative block">
          <span className="sr-only">Search learners</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={query} placeholder="Search learner or admission no." className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated pl-9 pr-3 text-xs outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft" />
        </label>
        <label>
          <span className="sr-only">Term</span>
          <select name="term" defaultValue={String(termNumber)} className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft">
            {[1, 2, 3].map((term) => <option key={term} value={term}>Term {term}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select name="status" defaultValue={status} className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs outline-none focus:border-brand/50 focus:ring-4 focus:ring-brand-soft">
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button type="submit" className="min-h-10 rounded-[var(--radius-sm)] bg-brand px-4 text-xs font-semibold text-white transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft">Apply</button>
      </form>
    </div>

    {statusPage.rows.length ? <>
      <div className="divide-y divide-border-subtle">
        {statusPage.rows.map((row, index) => <article key={row.enrolmentId} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_auto] sm:items-center sm:px-5">
          <p className="text-[0.68rem] font-semibold text-muted-foreground">{(statusPage.page - 1) * statusPage.pageSize + index + 1}</p>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{row.name}</p>
            <p className="mt-1 truncate text-[0.67rem] text-muted-foreground">{row.admissionNumber ?? "No admission number"}</p>
          </div>
          <p className="text-[0.7rem] text-muted-foreground">{row.grade}</p>
          <p className="text-[0.7rem] text-muted-foreground">{row.registerClass}</p>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.64rem] font-semibold ${statusClasses[row.reportStatus]}`}>{statusLabels[row.reportStatus]}</span>
            {row.pdfReady ? <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold text-[color:var(--success)]"><FileCheck2 className="size-3.5" />PDF ready</span> : null}
          </div>
        </article>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3 sm:px-5">
        <p className="text-[0.68rem] text-muted-foreground">Showing {start}-{end} of {statusPage.totalCount}</p>
        <div className="flex items-center gap-2">
          {statusPage.page > 1 ? <Link href={buildHref({ page: statusPage.page - 1, termNumber, query, status })} className="inline-flex min-h-9 items-center rounded-[var(--radius-xs)] border border-border-subtle px-3 text-xs font-semibold hover:bg-surface-muted">Previous</Link> : <span className="inline-flex min-h-9 items-center rounded-[var(--radius-xs)] border border-border-subtle px-3 text-xs font-semibold text-muted-foreground opacity-45">Previous</span>}
          <span className="text-[0.68rem] text-muted-foreground">Page {statusPage.page} of {statusPage.pageCount}</span>
          {statusPage.page < statusPage.pageCount ? <Link href={buildHref({ page: statusPage.page + 1, termNumber, query, status })} className="inline-flex min-h-9 items-center rounded-[var(--radius-xs)] border border-border-subtle px-3 text-xs font-semibold hover:bg-surface-muted">Next</Link> : <span className="inline-flex min-h-9 items-center rounded-[var(--radius-xs)] border border-border-subtle px-3 text-xs font-semibold text-muted-foreground opacity-45">Next</span>}
        </div>
      </div>
    </> : <div className="px-4 py-12 text-center sm:px-5"><p className="text-sm font-semibold">No matching report cards</p><p className="mt-1 text-xs text-muted-foreground">Try a different learner search, term or status.</p></div>}
  </section>;
}
