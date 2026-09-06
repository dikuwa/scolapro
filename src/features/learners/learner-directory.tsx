"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Printer, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import type { LearnerListItem } from "@/features/learners/server/queries";
import type { GradeOption } from "@/features/learners/server/registration-options";
import { formatPersonName } from "@/lib/person-name";

export function LearnerDirectory({
  learners,
  academicOptions = [],
  total,
  page,
  pageSize,
  pageCount,
  initialFilters,
}: {
  learners: LearnerListItem[];
  academicOptions?: GradeOption[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  initialFilters: {
    query: string;
    status: string;
    grade: string;
    registerClass: string;
    sex: string;
    sortOrder: "asc" | "desc";
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isFiltering, startFiltering] = useTransition();
  const [query, setQuery] = useState(initialFilters.query);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gradeOptions = useMemo(() => academicOptions.map((item) => item.label), [academicOptions]);
  const grades = gradeOptions.length ? gradeOptions : Array.from(new Set(learners.map((item) => item.grade))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const classes = useMemo(() => {
    if (academicOptions.length) {
      const source = initialFilters.grade === "all" ? academicOptions : academicOptions.filter((item) => item.label === initialFilters.grade);
      return Array.from(new Set(source.flatMap((item) => item.classes.map((entry) => entry.label)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    return Array.from(new Set(learners.map((item) => item.registerClass))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [academicOptions, initialFilters.grade, learners]);

  function replaceParams(updates: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all" || (key === "status" && value === "current") || (key === "sort" && value === "asc")) next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    const href = next.size ? `${pathname}?${next.toString()}` : pathname;
    startFiltering(() => router.replace(href, { scroll: false }));
  }

  function updateSearch(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => replaceParams({ q: value.trim() || null }), 300);
  }

  useEffect(() => {
    const needle = initialFilters.query.trim();
    if (!/^\d+$/.test(needle)) return;
    const requestedRow = Number(needle);
    if (requestedRow < 1 || requestedRow > total) return;
    document.getElementById(`learner-row-${requestedRow}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [initialFilters.query, total]);

  const hasFilters = Boolean(initialFilters.query || initialFilters.status !== "current" || initialFilters.grade !== "all" || initialFilters.registerClass !== "all" || initialFilters.sex !== "all" || initialFilters.sortOrder !== "asc");
  const firstShown = total ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, total);
  const canExportClassList = initialFilters.grade !== "all" && initialFilters.registerClass !== "all";
  const classListHref = canExportClassList
    ? `/api/official-documents/class-list?grade=${encodeURIComponent(initialFilters.grade)}&class=${encodeURIComponent(initialFilters.registerClass)}`
    : "";
  const classListPdfHref = classListHref ? `${classListHref}&format=pdf` : "";

  return (
    <>
      <div className="mb-4 grid gap-2 rounded-[var(--radius-md)] bg-surface-muted/55 p-3 xl:grid-cols-[minmax(15rem,1fr)_auto] xl:items-center">
        <label className="scolapro-control-surface flex min-h-10 min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-3 sm:max-w-lg">
          {isFiltering ? <Spinner className="size-4 shrink-0 text-brand" /> : <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
          <input value={query} onChange={(event) => updateSearch(event.target.value)} placeholder="Search learner name/admission no. or type a row number…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" autoComplete="off" />
          {query ? <button type="button" onClick={() => { setQuery(""); replaceParams({ q: null }); }} aria-label="Clear search" className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><X className="size-3.5" /></button> : null}
        </label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:min-w-[42rem]">
          <Picker ariaLabel="Learner status" name="learner-status-filter" value={initialFilters.status} onChange={(value) => replaceParams({ status: value })} placeholder="Status" options={[{ value: "current", label: "Current" }, { value: "all", label: "All statuses" }]} />
          <Picker ariaLabel="Filter by grade" name="learner-grade-filter" value={initialFilters.grade} onChange={(value) => replaceParams({ grade: value, class: null })} placeholder="All grades" options={[{ value: "all", label: "All grades" }, ...grades.map((item) => ({ value: item, label: item }))]} />
          <Picker ariaLabel="Filter by register class" name="learner-class-filter" value={initialFilters.registerClass} onChange={(value) => replaceParams({ class: value })} placeholder="All classes" options={[{ value: "all", label: "All classes" }, ...classes.map((item) => ({ value: item, label: item }))]} />
          <Picker ariaLabel="Filter by gender" name="learner-sex-filter" value={initialFilters.sex} onChange={(value) => replaceParams({ sex: value })} placeholder="All genders" options={[{ value: "all", label: "All genders" }, { value: "female", label: "Girls" }, { value: "male", label: "Boys" }, { value: "other", label: "Other" }, { value: "unspecified", label: "Unspecified" }]} />
          <Picker ariaLabel="Sort learners" name="learner-sort" value={initialFilters.sortOrder} onChange={(value) => replaceParams({ sort: value === "desc" ? "desc" : "asc" })} placeholder="A–Z" options={[{ value: "asc", label: "A–Z" }, { value: "desc", label: "Z–A" }]} />
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:col-start-2 xl:justify-self-end">
          {canExportClassList ? <>
            <Link href={classListHref} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface px-2.5 text-[0.7rem] font-medium text-foreground shadow-[var(--shadow-xs)] hover:bg-surface-muted"><Printer aria-hidden="true" className="size-3.5" />Print class list</Link>
            <a href={classListPdfHref} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface px-2.5 text-[0.7rem] font-medium text-foreground shadow-[var(--shadow-xs)] hover:bg-surface-muted"><Download aria-hidden="true" className="size-3.5" />Download PDF</a>
          </> : null}
          {hasFilters ? <button type="button" onClick={() => { setQuery(""); startFiltering(() => router.replace(pathname, { scroll: false })); }} className="min-h-8 rounded-[var(--radius-xs)] px-2 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface hover:text-foreground">Clear filters</button> : null}
        </div>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]" aria-busy={isFiltering}>
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2"><Users aria-hidden="true" className="size-4 text-brand-strong" /><h2 className="scolapro-section-title">Learners</h2></div>
          <span className="text-xs text-muted-foreground">{total ? `${firstShown}–${lastShown} of ${total}` : "0 learners"}</span>
        </div>
        {learners.length ? <div className="max-h-[70vh] overflow-auto">
          <div className="sticky top-0 z-10 hidden grid-cols-[3rem_minmax(14rem,1.4fr)_8rem_8rem_9rem_7rem_2rem] gap-3 border-b border-border-subtle bg-surface-muted px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground shadow-[0_1px_0_var(--border-subtle)] md:grid"><span className="text-center">No.</span><span>Learner</span><span>Number</span><span>Grade</span><span>Class</span><span>Status</span><span className="sr-only">Open</span></div>
          <div className="divide-y divide-border-subtle">{learners.map((learner, index) => { const displayName = formatPersonName(learner.name); const rowNumber = (page - 1) * pageSize + index + 1; return <Link id={`learner-row-${rowNumber}`} key={learner.id} href={`/learners/${learner.id}`} onClick={() => setNavigatingId(learner.id)} className="grid gap-2 px-4 py-3.5 transition hover:bg-surface-muted/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[color:var(--brand-soft)] sm:px-5 md:grid-cols-[3rem_minmax(14rem,1.4fr)_8rem_8rem_9rem_7rem_2rem] md:items-center md:gap-3"><span className="hidden text-center text-xs tabular-nums text-muted-foreground md:block">{rowNumber}</span><div className="flex min-w-0 items-center gap-3"><span className="text-xs tabular-nums text-muted-foreground md:hidden">{rowNumber}.</span><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand-soft text-xs font-semibold text-brand-strong">{displayName.split(" ").map((part) => part[0]).join("").slice(0,2)}</span><div className="min-w-0"><p className="scolapro-record-title truncate">{displayName}</p><p className="mt-0.5 text-xs text-muted-foreground md:hidden">{learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}</p></div></div><span className="hidden text-xs text-muted-foreground md:block">{learner.admissionNumber ?? "—"}</span><span className="hidden text-xs text-foreground md:block">{learner.grade}</span><span className="hidden text-xs text-foreground md:block">{learner.registerClass}</span><span className="hidden w-fit rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 text-[0.7rem] font-medium capitalize text-[color:var(--success)] md:inline-flex">{learner.status}</span>{navigatingId === learner.id ? <Spinner className="hidden size-4 text-brand md:block" /> : <ChevronRight aria-hidden="true" className="hidden size-4 text-muted-foreground md:block" />}</Link>; })}</div>
        </div> : <div className="px-5 py-12 text-center"><span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><Users aria-hidden="true" className="size-5" /></span><h3 className="mt-3 text-sm font-semibold">No learners match these filters</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Try a shorter search or clear the filters.</p></div>}

        {total > pageSize ? <div className="flex flex-col gap-2 border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5"><span>Page {page} of {pageCount}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || isFiltering} onClick={() => replaceParams({ page: String(page - 1) }, false)} className="inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted px-3 font-medium text-foreground disabled:opacity-40"><ChevronLeft className="size-3.5" />Previous</button><button type="button" disabled={page >= pageCount || isFiltering} onClick={() => replaceParams({ page: String(page + 1) }, false)} className="inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted px-3 font-medium text-foreground disabled:opacity-40">Next<ChevronRight aria-hidden="true" className="size-3.5" /></button></div></div> : null}
      </section>
    </>
  );
}
