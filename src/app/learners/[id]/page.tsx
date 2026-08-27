import Link from "next/link";
import { ArrowLeft, CalendarDays, FileText, GraduationCap, MapPin, UserRound } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";

const demoLearners = {
  "demo-001": {
    name: "Amara Demo",
    preferredName: "Amara",
    number: "DEMO-001",
    grade: "Grade 10",
    registerClass: "10/A",
    dateOfBirth: "14 May 2010",
    admissionDate: "12 January 2026",
  },
  "demo-002": {
    name: "Tomas Sample",
    preferredName: "Tomas",
    number: "DEMO-002",
    grade: "Grade 10",
    registerClass: "10/B",
    dateOfBirth: "3 February 2010",
    admissionDate: "12 January 2026",
  },
} as const;

export default async function LearnerOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const learner = demoLearners[id as keyof typeof demoLearners] ?? demoLearners["demo-001"];

  return (
    <AppShell>
      <section className="mx-auto max-w-[94rem]">
        <Link href="/learners" className="mb-4 inline-flex items-center gap-2 rounded-lg py-1 text-xs font-medium text-muted-foreground transition duration-200 hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Learners
        </Link>

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-sm font-semibold text-brand-strong">
              {learner.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)] font-semibold tracking-[-0.035em]">{learner.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{learner.number} · {learner.grade} · {learner.registerClass}</p>
            </div>
          </div>
          <span className="inline-flex w-fit rounded-lg bg-success-soft px-2.5 py-1.5 text-xs font-medium text-[color:var(--success)]">Current learner</span>
        </div>

        <nav aria-label="Learner sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-border-subtle pb-px">
          {["Overview", "Academic", "Attendance", "Wellbeing", "Conduct & achievement", "Family", "Documents", "History"].map((item, index) => (
            <button
              key={item}
              type="button"
              className={[
                "shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium transition duration-200",
                index === 0 ? "border-brand text-brand-strong" : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <section className="rounded-2xl border border-border/80 bg-surface shadow-[var(--shadow-sm)]">
            <div className="border-b border-border-subtle px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold">Learner overview</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Core identity and current enrolment information.</p>
            </div>

            <dl className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 sm:p-5">
              <div>
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><UserRound aria-hidden="true" className="size-4" /> Preferred name</dt>
                <dd className="mt-1.5 text-sm font-medium">{learner.preferredName}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarDays aria-hidden="true" className="size-4" /> Date of birth</dt>
                <dd className="mt-1.5 text-sm font-medium">{learner.dateOfBirth}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><GraduationCap aria-hidden="true" className="size-4" /> Current placement</dt>
                <dd className="mt-1.5 text-sm font-medium">{learner.grade} · {learner.registerClass}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><MapPin aria-hidden="true" className="size-4" /> School</dt>
                <dd className="mt-1.5 text-sm font-medium">ScolaPro Demonstration School</dd>
              </div>
            </dl>
          </section>

          <aside className="space-y-3">
            <section className="rounded-2xl bg-surface-muted p-4 sm:p-5">
              <h2 className="text-sm font-semibold">Current enrolment</h2>
              <div className="mt-4 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Admission date</span><span className="font-medium">{learner.admissionDate}</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Academic year</span><span className="font-medium">2026</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Status</span><span className="font-medium">Current</span></div>
              </div>
            </section>

            <section className="rounded-2xl border border-border/80 bg-surface p-4 shadow-[var(--shadow-sm)] sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-muted text-muted-foreground"><FileText aria-hidden="true" className="size-4" /></span>
                <div>
                  <h2 className="text-sm font-semibold">Longitudinal record</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Academic, attendance, support and transfer history will remain linked without rewriting earlier school records.</p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
