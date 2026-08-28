"use client";

import Link from "next/link";
import { ChevronRight, Search, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { LearnerListItem } from "@/features/learners/server/queries";

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function LearnerDirectory({ learners }: { learners: LearnerListItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("current");
  const [grade, setGrade] = useState("all");
  const [registerClass, setRegisterClass] = useState("all");

  const grades = useMemo(() => Array.from(new Set(learners.map((item) => item.grade))).sort(), [learners]);
  const classes = useMemo(
    () => Array.from(new Set(learners.filter((item) => grade === "all" || item.grade === grade).map((item) => item.registerClass))).sort(),
    [grade, learners],
  );

  const filtered = useMemo(() => {
    const needle = normalized(query);
    return learners.filter((learner) => {
      const haystack = normalized(`${learner.name} ${learner.preferredName ?? ""} ${learner.admissionNumber ?? ""} ${learner.grade} ${learner.registerClass}`);
      return (!needle || haystack.includes(needle))
        && (status === "all" || learner.status === status)
        && (grade === "all" || learner.grade === grade)
        && (registerClass === "all" || learner.registerClass === registerClass);
    });
  }, [grade, learners, query, registerClass, status]);

  const hasFilters = Boolean(query || status !== "current" || grade !== "all" || registerClass !== "all");

  function clearFilters() {
    setQuery("");
    setStatus("current");
    setGrade("all");
    setRegisterClass("all");
  }

  return (
    <>
      <div className="mb-4 grid gap-2 rounded-[var(--radius-md)] bg-surface-muted p-3 shadow-[var(--shadow-xs)] lg:grid-cols-[minmax(15rem,1fr)_auto] lg:items-center">
        <label className="scolapro-control-surface flex min-h-10 min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-3 sm:max-w-lg">
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search learner name or admission number…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            autoComplete="off"
          />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><X className="size-3.5" /></button> : null}
        </label>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Learner status" className="scolapro-control-surface min-h-9 rounded-[var(--radius-sm)] px-2.5 text-xs text-foreground outline-none">
            <option value="current">Current</option>
            <option value="all">All statuses</option>
          </select>
          <select value={grade} onChange={(event) => { setGrade(event.target.value); setRegisterClass("all"); }} aria-label="Filter by grade" className="scolapro-control-surface min-h-9 rounded-[var(--radius-sm)] px-2.5 text-xs text-foreground outline-none">
            <option value="all">All grades</option>
            {grades.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={registerClass} onChange={(event) => setRegisterClass(event.target.value)} aria-label="Filter by register class" className="scolapro-control-surface min-h-9 rounded-[var(--radius-sm)] px-2.5 text-xs text-foreground outline-none">
            <option value="all">All classes</option>
            {classes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          {hasFilters ? <button type="button" onClick={clearFilters} className="min-h-9 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground">Clear filters</button> : null}
        </div>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2"><Users aria-hidden="true" className="size-4 text-brand-strong" /><h2 className="scolapro-section-title">Learners</h2></div>
          <span className="text-xs text-muted-foreground">{filtered.length} shown</span>
        </div>
        {filtered.length ? <>
          <div className="hidden grid-cols-[minmax(14rem,1.4fr)_8rem_8rem_9rem_7rem_2rem] gap-3 border-b border-border-subtle bg-surface-muted/60 px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground md:grid"><span>Learner</span><span>Number</span><span>Grade</span><span>Class</span><span>Status</span><span className="sr-only">Open</span></div>
          <div className="divide-y divide-border-subtle">{filtered.map((learner) => <Link key={learner.id} href={`/learners/${learner.id}`} className="grid gap-2 px-4 py-3.5 transition hover:bg-surface-muted/70 sm:px-5 md:grid-cols-[minmax(14rem,1.4fr)_8rem_8rem_9rem_7rem_2rem] md:items-center md:gap-3">
            <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand-soft text-xs font-semibold text-brand-strong">{learner.name.split(" ").map((part) => part[0]).join("").slice(0,2)}</span><div className="min-w-0"><p className="scolapro-record-title truncate">{learner.name}</p><p className="mt-0.5 text-xs text-muted-foreground md:hidden">{learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}</p></div></div>
            <span className="hidden text-xs text-muted-foreground md:block">{learner.admissionNumber ?? "—"}</span><span className="hidden text-xs text-foreground md:block">{learner.grade}</span><span className="hidden text-xs text-foreground md:block">{learner.registerClass}</span><span className="hidden w-fit rounded-[var(--radius-xs)] bg-success-soft px-2 py-1 text-[0.7rem] font-medium capitalize text-[color:var(--success)] md:inline-flex">{learner.status}</span><ChevronRight aria-hidden="true" className="hidden size-4 text-muted-foreground md:block" />
          </Link>)}</div>
        </> : <div className="px-5 py-12 text-center"><span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><Users aria-hidden="true" className="size-5" /></span><h3 className="mt-3 text-sm font-semibold">No learners match these filters</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Try a shorter search or clear the filters.</p></div>}
      </section>
    </>
  );
}
