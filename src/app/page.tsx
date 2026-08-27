import { AlertCircle, ArrowUpRight, BookCheck, Clock3, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";

const metrics = [
  { label: "Current learners", value: "849", detail: "Across Grades 8–12", icon: Users },
  { label: "Attendance", value: "95.2%", detail: "This term", icon: Clock3 },
  { label: "Marks readiness", value: "88%", detail: "41 entries need attention", icon: BookCheck },
];

const tasks = [
  { title: "Grade 10/A attendance", meta: "Register confirmation due today", tone: "warning" },
  { title: "Physical Science · Grade 10", meta: "Exam marks window closes Friday", tone: "info" },
  { title: "Learner support follow-up", meta: "2 items assigned to you", tone: "neutral" },
];

export default function Home() {
  return (
    <AppShell>
      <section className="mx-auto max-w-[94rem]">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)] font-semibold tracking-[-0.035em] text-foreground">
              Good afternoon, Martin
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Thursday, 27 August · Namib High School</p>
          </div>

          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-sm)] transition duration-200 hover:bg-brand-strong sm:self-auto"
          >
            Open today&apos;s classes
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <article key={metric.label} className="rounded-2xl border border-border/80 bg-surface px-4 py-4 shadow-[var(--shadow-sm)] sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                    <p className="mt-2 text-[clamp(1.45rem,1.2rem+0.55vw,1.9rem)] font-semibold tracking-[-0.04em] text-foreground">
                      {metric.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
                  </div>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-muted text-brand-strong">
                    <Icon aria-hidden="true" className="size-[1.05rem]" strokeWidth={1.8} />
                  </span>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,0.8fr)]">
          <section className="overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3.5 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold tracking-[-0.015em]">Today</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Your timetable and immediate work</p>
              </div>
              <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-strong transition duration-200 hover:bg-brand-soft">
                Full timetable
              </button>
            </div>

            <div className="divide-y divide-border-subtle">
              {[
                ["08:00", "Grade 10/A", "Physical Science", "Lab 2"],
                ["09:20", "Grade 8/B", "Physical Science", "Room 14"],
                ["11:00", "Grade 10/C", "Physical Science", "Lab 2"],
                ["12:40", "Grade 8/D", "Physical Science", "Room 11"],
              ].map(([time, group, subject, room], index) => (
                <div key={`${time}-${group}`} className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition duration-200 hover:bg-surface-muted/70 sm:px-5">
                  <time className="text-xs font-medium tabular-nums text-muted-foreground">{time}</time>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{group} · {subject}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{room}</p>
                  </div>
                  <span className={index === 0 ? "rounded-lg bg-success-soft px-2 py-1 text-[0.7rem] font-medium text-[color:var(--success)]" : "text-xs text-muted-foreground"}>
                    {index === 0 ? "Next" : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-surface-muted p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold tracking-[-0.015em]">Needs attention</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Only actionable exceptions</p>
              </div>
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-surface px-2 py-1 text-[0.68rem] font-semibold text-muted-foreground">3</span>
            </div>

            <div className="space-y-2">
              {tasks.map((task) => (
                <button
                  key={task.title}
                  type="button"
                  className="flex w-full items-start gap-3 rounded-xl bg-surface px-3.5 py-3 text-left shadow-[var(--shadow-sm)] transition duration-200 hover:-translate-y-px hover:bg-surface-elevated"
                >
                  <span className={[
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                    task.tone === "warning" ? "bg-warning-soft text-[color:var(--warning)]" : task.tone === "info" ? "bg-info-soft text-[color:var(--info)]" : "bg-surface-subtle text-muted-foreground",
                  ].join(" ")}>
                    <AlertCircle aria-hidden="true" className="size-4" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{task.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{task.meta}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
