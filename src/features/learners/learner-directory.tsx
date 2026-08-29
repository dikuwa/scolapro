"use client";

import Link from "next/link";
import { ChevronRight, Search, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Picker } from "@/components/ui/picker";
import type { LearnerListItem } from "@/features/learners/server/queries";
import type { GradeOption } from "@/features/learners/server/registration-options";
import { formatPersonName } from "@/lib/person-name";

function normalized(value: string) { return value.trim().toLocaleLowerCase(); }

export function LearnerDirectory({ learners, academicOptions = [] }: { learners: LearnerListItem[]; academicOptions?: GradeOption[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("current");
  const [grade, setGrade] = useState("all");
  const [registerClass, setRegisterClass] = useState("all");

  const gradeOptions = useMemo(() => academicOptions.map((item) => item.label), [academicOptions]);
  const fallbackGrades = useMemo(() => Array.from(new Set(learners.map((item) => item.grade))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [learners]);
  const grades = gradeOptions.length ? gradeOptions : fallbackGrades;
  const classes = useMemo(() => {
    if (academicOptions.length) {
      const source = grade === "all" ? academicOptions : academicOptions.filter((item) => item.label === grade);
      return Array.from(new Set(source.flatMap((item) => item.classes.map((entry) => entry.label)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    return Array.from(new Set(learners.filter((item) => grade === "all" || item.grade === grade).map((item) => item.registerClass))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [academicOptions, grade, learners]);

  const filtered = useMemo(() => {
    const needle = normalized(query);
    return learners.filter((learner) => {
      const displayName = formatPersonName(learner.name);
      const haystack = normalized(`${displayName} ${learner.name} ${learner.preferredName ?? ""} ${learner.admissionNumber ?? ""} ${learner.grade} ${learner.registerClass}`);
      return (!needle || haystack.includes(needle)) && (status === "all" || learner.status === status) && (grade === "all" || learner.grade === grade) && (registerClass === "all" || learner.registerClass === registerClass);
    });
  }, [grade, learners, query, registerClass, status]);

  const hasFilters = Boolean(query || status !== "current" || grade !== "all" || registerClass !== "all");
  function clearFilters() { setQuery(""); setStatus("current"); setGrade("all"); setRegisterClass("all"); }

  return (
    <>
      <div className="mb-4 grid gap-2 rounded-[var(--radius-md)] bg-surface-muted/55 p-3 lg:grid-cols-[minmax(15rem,1fr)_auto] lg:items-center">
        <label className="scolapro-control-surface flex min-h-10 min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-3 sm:max-w-lg"><Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search learner name or admission number…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" autoComplete="off" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><X className="size-3.5" /></button> : null}</label>
        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[25rem]"><Picker ariaLabel="Learner status" name="learner-status-filter" value={status} onChange={setStatus} placeholder="Status" options={[{ value: "current", label: "Current" }, { value: "all", label: "All statuses" }]} /><Picker ariaLabel="Filter by grade" name="learner-grade-filter" value={grade} onChange={(value) => { setGrade(value); setRegisterClass("all"); }} placeholder="All grades" options={[{ value: "all", label: "All grades" }, ...grades.map((item) => ({ value: item, label: item }))]} /><Picker ariaLabel="Filter by register class" name="learner-class-filter" value={registerClass} onChange={setRegisterClass} placeholder="All classes" options={[{ value: "all", label: "All classes" }, ...classes.map((item) => ({ value: item, label: item }))]} /></div>
        {hasFilters ? <button type="button" onClick={clearFilters} className="justify-self-start min-h-8 rounded-[var(--radius-xs)] px-2 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface hover:text-foreground lg:col-start-2 lg:justify-self-end">Clear filters</button> : null}
      </div>

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 sm:px-5"><div className="flex items-center gap-2"><Users aria-hidden="true" className="size-4 text-brand-strong" /><h2 className="scolapro-section-title">Learners</h2></div><span className="text-xs text-muted-foreground">{filtered.length} shown</span></div>
        {filtered.length ? <>
          <div className="hidden grid-cols-[minmax(14rem,1.4fr)_8rem_8rem_9rem_7rem_2rem] gap-3 border-b border-border-subtle bg-surface-muted/60 px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground md:grid"><span>Learner</span><span>Number</span><span>Grade</span><span>Class</span><span>Status</span><span className="sr-only">Open</span></div>
          <div className="divide-y divide-border-subtle">{filtered.map((learner) => { const displayName = formatPersonName(learner.name); return <Link key={learner.id} href={`/learners/${learner.id}`} className="grid gap-2 px-4 py-3.5 transition hover:bg-surface-muted/70 sm:px-5 md:grid-cols-[minmax(14rem,1.4fr)_8rem_8rem_9rem_7rem_2rem] md:items-center md:gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand-soft text-xs font-semibold text-brand-strong">{displayName.split(" ").map((part) => part[0]).join("").slice(0,2)}</span><div className="min-w-0"><p className="scolapro-record-title truncate">{displayName}</p><p className="mt-0.5 text-xs text-muted-foreground md:hidden">{learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}</p></div></div><span className="hidden text-xs text-muted-foreground md:block">{learner.admissionNumber ?? "—"}</span><span className="hidden text-xs text-foreground md:block">{learner.grade}</span><span className="hidden text-xs text-foreground md:block">{learner.registerClass}</span><span className="hidden w-fit rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 text-[0.7rem] font-medium capitalize text-[color:var(--success)] md:inline-flex">{learner.status}</span><ChevronRight aria-hidden="true" className="hidden size-4 text-muted-foreground md:block" /></Link>; })}</div>
        </> : <div className="px-5 py-12 text-center"><span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><Users aria-hidden="true" className="size-5" /></span><h3 className="mt-3 text-sm font-semibold">No learners match these filters</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Try a shorter search or clear the filters.</p></div>}
      </section>
    </>
  );
}
