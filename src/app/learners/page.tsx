import Link from "next/link";
import { ChevronRight, Plus, Search, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";

const learners = [
  { id: "demo-001", name: "Amara Demo", number: "DEMO-001", grade: "Grade 10", registerClass: "10/A", status: "Current" },
  { id: "demo-002", name: "Tomas Sample", number: "DEMO-002", grade: "Grade 10", registerClass: "10/B", status: "Current" },
];

export default function LearnersPage() {
  return (
    <AppShell>
      <section className="mx-auto max-w-[94rem]">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)] font-semibold tracking-[-0.035em]">Learners</h1>
            <p className="mt-1 text-sm text-muted-foreground">Current learner identities and school enrolments.</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-sm)] transition duration-200 hover:bg-brand-strong sm:self-auto"
          >
            <Plus aria-hidden="true" className="size-4" />
            Register learner
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-surface-muted p-3 sm:flex-row sm:items-center">
          <button
            type="button"
            className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-left text-sm text-muted-foreground shadow-[var(--shadow-sm)] transition duration-200 hover:border-[color:var(--brand)]/30 hover:text-foreground sm:max-w-md"
          >
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">Search learner name or number…</span>
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-9 rounded-lg bg-surface px-3 text-xs font-medium text-foreground shadow-[var(--shadow-sm)]">Current</button>
            <button type="button" className="min-h-9 rounded-lg px-3 text-xs font-medium text-muted-foreground transition duration-200 hover:bg-surface hover:text-foreground">All grades</button>
            <button type="button" className="min-h-9 rounded-lg px-3 text-xs font-medium text-muted-foreground transition duration-200 hover:bg-surface hover:text-foreground">All classes</button>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Users aria-hidden="true" className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Current learners</h2>
            </div>
            <span className="text-xs text-muted-foreground">2 shown</span>
          </div>

          <div className="hidden grid-cols-[minmax(14rem,1.4fr)_8rem_8rem_8rem_7rem_2rem] gap-3 border-b border-border-subtle bg-surface-muted/60 px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.06em] text-muted-foreground md:grid">
            <span>Learner</span>
            <span>Number</span>
            <span>Grade</span>
            <span>Class</span>
            <span>Status</span>
            <span className="sr-only">Open</span>
          </div>

          <div className="divide-y divide-border-subtle">
            {learners.map((learner) => (
              <Link
                key={learner.id}
                href={`/learners/${learner.id}`}
                className="grid gap-2 px-4 py-3.5 transition duration-200 hover:bg-surface-muted/70 sm:px-5 md:grid-cols-[minmax(14rem,1.4fr)_8rem_8rem_8rem_7rem_2rem] md:items-center md:gap-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
                    {learner.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{learner.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{learner.number} · {learner.grade} {learner.registerClass}</p>
                  </div>
                </div>
                <span className="hidden text-xs text-muted-foreground md:block">{learner.number}</span>
                <span className="hidden text-xs text-foreground md:block">{learner.grade}</span>
                <span className="hidden text-xs text-foreground md:block">{learner.registerClass}</span>
                <span className="hidden w-fit rounded-lg bg-success-soft px-2 py-1 text-[0.7rem] font-medium text-[color:var(--success)] md:inline-flex">{learner.status}</span>
                <ChevronRight aria-hidden="true" className="hidden size-4 text-muted-foreground md:block" />
              </Link>
            ))}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
