import Link from "next/link";
import { ArrowLeft, Brain, Building2, FileText, HeartPulse, MessageSquareText, ShieldCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getLearnerCumulativeRecord } from "@/features/learners/server/cumulative-record";
import { getLearnerOverview } from "@/features/learners/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function EmptyRecord({ children }: { children: string }) {
  return <p className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-4 text-xs leading-5 text-muted-foreground">{children}</p>;
}

export default async function LearnerCumulativeRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getUserContext();
  if (!context.user) redirect("/login");
  const membership = context.memberships[0];
  if (!membership) redirect("/");

  const learner = await getLearnerOverview(id, membership.schoolId);
  if (!learner) notFound();
  const record = await getLearnerCumulativeRecord(id, membership.schoolId);

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <Link href={`/learners/${id}`} className="mb-4 inline-flex items-center gap-2 rounded-[var(--radius-sm)] py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Learner profile</Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-medium text-brand-strong">Cumulative learner record</p><h1 className="scolapro-page-title mt-1 text-xl">{learner.name}</h1><p className="mt-1 text-sm text-muted-foreground">{learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}</p></div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-[0.68rem] font-semibold text-muted-foreground"><ShieldCheck className="size-3.5" aria-hidden="true" />Role-scoped record</span>
          </div>
        </div>

        <section className="rounded-[var(--radius-md)] border border-border-subtle bg-brand-soft/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
          This digital record follows the Namibian cumulative-record structure while keeping each item in its authoritative ScolaPro domain. Restricted health and psychometric material appears only when your role has explicit need-to-know access.
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="bg-surface shadow-[var(--shadow-xs)]">
            <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><Building2 className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Schools attended</h2><p className="scolapro-section-description">Verified schooling that predates or sits outside ScolaPro enrolment history.</p></div></div>
            <div className="space-y-2 p-4 sm:p-5">{record.priorSchools.length ? record.priorSchools.map((item) => <article key={item.id} className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold">{item.schoolName}</h3>{item.medium ? <span className="text-[0.68rem] text-muted-foreground">{item.medium}</span> : null}</div><p className="mt-1.5 text-xs text-muted-foreground">Admission: {formatDate(item.admissionDate)}{item.admissionGrade ? ` · ${item.admissionGrade}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">Departure: {formatDate(item.departureDate)}{item.departureGrade ? ` · ${item.departureGrade}` : ""}</p></article>) : <EmptyRecord>No verified previous-school entries have been added yet. Current ScolaPro enrolments remain in the learner’s normal enrolment history.</EmptyRecord>}</div>
          </section>

          <section className="bg-surface shadow-[var(--shadow-xs)]">
            <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><FileText className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Personality-development observations</h2><p className="scolapro-section-description">Psychological, social and overall-impression narratives by year and grade.</p></div></div>
            <div className="space-y-2 p-4 sm:p-5">{record.developmentObservations.length ? record.developmentObservations.map((item) => <article key={item.id} className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold capitalize">{item.domain.replaceAll("_", " ")}</h3><span className="text-[0.68rem] text-muted-foreground">{item.gradeLabel ?? "Grade not recorded"} · {item.academicYear}</span></div><p className="mt-2 text-sm leading-6">{item.observation}</p></article>) : <EmptyRecord>No personality-development observations are visible for this learner.</EmptyRecord>}</div>
          </section>

          <section className="bg-surface shadow-[var(--shadow-xs)]">
            <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-danger-soft text-[color:var(--danger)]"><HeartPulse className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Physical / health history</h2><p className="scolapro-section-description">Restricted cumulative information. Absence here may mean no record or insufficient permission.</p></div></div>
            <div className="space-y-2 p-4 sm:p-5">{record.healthHistory.length ? record.healthHistory.map((item) => <article key={item.id} className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3"><p className="text-[0.68rem] font-medium text-muted-foreground">{formatDate(item.observedOn)}</p>{item.generalHealth ? <p className="mt-1.5 text-sm"><span className="font-medium">General health:</span> {item.generalHealth}</p> : null}{item.problemOrDisability ? <p className="mt-1 text-sm"><span className="font-medium">Problem / disability:</span> {item.problemOrDisability}</p> : null}{item.managementOrSupport ? <p className="mt-1 text-sm"><span className="font-medium">Action / support:</span> {item.managementOrSupport}</p> : null}{item.previousIllnesses ? <p className="mt-1 text-sm"><span className="font-medium">Previous illnesses:</span> {item.previousIllnesses}</p> : null}</article>) : <EmptyRecord>No restricted physical/health history is available to your current role.</EmptyRecord>}</div>
          </section>

          <section className="bg-surface shadow-[var(--shadow-xs)]">
            <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-warning-soft text-[color:var(--warning)]"><Brain className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Psychometric data</h2><p className="scolapro-section-description">Highly restricted test ledger. Full evidence remains in governed support/document storage.</p></div></div>
            <div className="space-y-2 p-4 sm:p-5">{record.psychometricRecords.length ? record.psychometricRecords.map((item) => <article key={item.id} className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold">{item.testName}</h3><span className="text-[0.68rem] text-muted-foreground">{formatDate(item.testDate)}</span></div><p className="mt-1.5 text-xs text-muted-foreground">{item.gradeLabel ?? "Grade not recorded"}{item.testerName ? ` · ${item.testerName}` : ""}</p>{item.remarks ? <p className="mt-2 text-sm leading-6">{item.remarks}</p> : null}</article>) : <EmptyRecord>No psychometric records are available to your current role.</EmptyRecord>}</div>
          </section>
        </div>

        <section className="bg-surface shadow-[var(--shadow-xs)]">
          <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><MessageSquareText className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">General remarks, recommendations & interviews</h2><p className="scolapro-section-description">Longitudinal narrative items from the cumulative record.</p></div></div>
          <div className="space-y-2 p-4 sm:p-5">{record.notes.length ? record.notes.map((item) => <article key={item.id} className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold capitalize">{item.noteType.replaceAll("_", " ")}</h3><span className="text-[0.68rem] text-muted-foreground">{formatDate(item.noteDate)}</span></div><p className="mt-2 text-sm leading-6">{item.note}</p></article>) : <EmptyRecord>No cumulative remarks or recommendations are visible for this learner.</EmptyRecord>}</div>
        </section>

        <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-muted px-4 py-3 text-xs leading-5 text-muted-foreground">
          Academic results, attendance, conduct, learner-support cases and current enrolment are intentionally not duplicated on this page yet; the final transferable CRC will compose them from their certified source records.
        </section>
      </div>
    </AppShell>
  );
}
