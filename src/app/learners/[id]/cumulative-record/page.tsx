import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, Brain, Building2, CalendarDays, FileText, GraduationCap, HeartPulse, MessageSquareText, Scale, ShieldCheck, UserRound } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { CrcRoutineContributionCard } from "@/features/crc/crc-routine-contribution-card";
import { getMyCrcContributionContext } from "@/features/crc/server/custody";
import { getEffectiveLearnerGuardianContact } from "@/features/guardians/server/queries";
import { getLearnerCumulativeRecord } from "@/features/learners/server/cumulative-record";
import { getLearnerOverview } from "@/features/learners/server/queries";
import { getUserContext } from "@/lib/auth/get-user-context";

const learnerOperationalRoles = new Set(["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher", "counsellor", "learner_support", "social_worker", "librarian"]);

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
  const membership = context.memberships.find((candidate) => learnerOperationalRoles.has(candidate.roleKey));
  if (!membership) redirect("/");

  const learner = await getLearnerOverview(id, membership.schoolId);
  if (!learner) notFound();
  const [record, contributionContext, guardian] = await Promise.all([
    getLearnerCumulativeRecord(id, membership.schoolId),
    getMyCrcContributionContext(id, membership.schoolId),
    getEffectiveLearnerGuardianContact(id, membership.schoolId).catch(() => null),
  ]);

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

        {contributionContext ? <CrcRoutineContributionCard context={contributionContext} /> : null}

        <section className="grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-border-subtle sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-surface px-4 py-4"><div className="flex items-center gap-2"><UserRound className="size-4 text-muted-foreground" aria-hidden="true" /><p className="text-xs font-medium text-muted-foreground">Effective guardian</p></div><p className="mt-2 text-sm font-semibold">{guardian?.guardianName ?? "Not available"}</p><p className="mt-1 text-xs text-muted-foreground">{guardian ? `${guardian.relationshipType.replaceAll("_", " ")} · ${guardian.phone}` : "No authorised effective contact returned"}</p></div>
          <div className="bg-surface px-4 py-4"><div className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" /><p className="text-xs font-medium text-muted-foreground">Attendance years</p></div><p className="mt-2 text-2xl font-semibold">{record.attendance.length}</p><p className="mt-1 text-xs text-muted-foreground">derived from canonical attendance events</p></div>
          <div className="bg-surface px-4 py-4"><div className="flex items-center gap-2"><GraduationCap className="size-4 text-muted-foreground" aria-hidden="true" /><p className="text-xs font-medium text-muted-foreground">Official results</p></div><p className="mt-2 text-2xl font-semibold">{record.officialResults.length}</p><p className="mt-1 text-xs text-muted-foreground">current official result versions only</p></div>
          <div className="bg-surface px-4 py-4"><div className="flex items-center gap-2"><ArrowRightLeft className="size-4 text-muted-foreground" aria-hidden="true" /><p className="text-xs font-medium text-muted-foreground">Transfers</p></div><p className="mt-2 text-2xl font-semibold">{record.transfers.length}</p><p className="mt-1 text-xs text-muted-foreground">derived from learner transfer events</p></div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="bg-surface shadow-[var(--shadow-xs)]">
            <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Attendance record</h2><p className="scolapro-section-description">Year summaries derived from canonical attendance observations.</p></div></div>
            <div className="space-y-2 p-4 sm:p-5">{record.sourceAccess.attendance ? (record.attendance.length ? record.attendance.map((year) => <article key={year.academicYear} className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{year.academicYear}</h3><span className="text-xs text-muted-foreground">{year.total} observations</span></div><div className="mt-2 flex flex-wrap gap-1.5">{year.statuses.map((item) => <span key={item.status} className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] text-muted-foreground">{item.status.replaceAll("_", " ")} · {item.count}</span>)}</div></article>) : <EmptyRecord>No attendance observations are available for this learner.</EmptyRecord>) : <EmptyRecord>Attendance facts are not available to your current role.</EmptyRecord>}</div>
          </section>

          <section className="bg-surface shadow-[var(--shadow-xs)]">
            <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><GraduationCap className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Official academic results</h2><p className="scolapro-section-description">Current official result versions; superseded result rows are not duplicated here.</p></div></div>
            <div className="space-y-2 p-4 sm:p-5">{record.sourceAccess.academics ? (record.officialResults.length ? record.officialResults.map((item) => <article key={item.id} className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{item.subjectName}</h3><span className="text-[0.68rem] text-muted-foreground">{item.academicYear} · Term {item.termNumber}</span></div><p className="mt-1.5 text-sm">{item.resultValue ?? "—"}{item.symbol ? ` · ${item.symbol}` : ""}<span className="ml-2 text-xs capitalize text-muted-foreground">{item.resultStatus.replaceAll("_", " ")}</span></p></article>) : <EmptyRecord>No official result rows are available for this learner.</EmptyRecord>) : <EmptyRecord>Official academic results are not available to your current role.</EmptyRecord>}</div>
          </section>

          <section className="bg-surface shadow-[var(--shadow-xs)]">
            <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><Scale className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Conduct record</h2><p className="scolapro-section-description">Canonical conduct facts in the caller&apos;s authorised school scope.</p></div></div>
            <div className="space-y-2 p-4 sm:p-5">{record.sourceAccess.conduct ? (record.conduct.length ? record.conduct.map((item) => <article key={item.id} className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold capitalize">{item.direction} · {item.categoryCode.replaceAll("_", " ")}</h3><span className="text-[0.68rem] text-muted-foreground">{formatDate(item.occurredOn)}</span></div><p className="mt-2 text-sm leading-6">{item.summary}</p><p className="mt-1 text-[0.68rem] capitalize text-muted-foreground">{item.severity} · {item.status.replaceAll("_", " ")}</p></article>) : <EmptyRecord>No conduct events are available for this learner.</EmptyRecord>) : <EmptyRecord>Conduct facts are not available to your current role.</EmptyRecord>}</div>
          </section>

          <section className="bg-surface shadow-[var(--shadow-xs)]">
            <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-warning-soft text-[color:var(--warning)]"><ShieldCheck className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Learner support</h2><p className="scolapro-section-description">Case metadata only. Counselling narratives and intervention notes remain in the least-privilege support workspace.</p></div></div>
            <div className="space-y-2 p-4 sm:p-5">{record.sourceAccess.support ? (record.support.length ? record.support.map((item) => <article key={item.id} className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold capitalize">{item.caseType.replaceAll("_", " ")}</h3><span className="text-[0.68rem] text-muted-foreground">{formatDate(item.openedOn)}</span></div><p className="mt-1.5 text-xs capitalize text-muted-foreground">{item.sensitivity} · {item.status.replaceAll("_", " ")}{item.closedOn ? ` · closed ${formatDate(item.closedOn)}` : ""}</p></article>) : <EmptyRecord>No learner-support cases are visible to your current role.</EmptyRecord>) : <EmptyRecord>Learner-support case metadata is restricted for your current role.</EmptyRecord>}</div>
          </section>

          <section className="bg-surface shadow-[var(--shadow-xs)] xl:col-span-2">
            <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><ArrowRightLeft className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Transfer history</h2><p className="scolapro-section-description">Authoritative learner transfer events from this school. CRC custody remains governed separately.</p></div></div>
            <div className="space-y-2 p-4 sm:p-5">{record.sourceAccess.transfers ? (record.transfers.length ? record.transfers.map((item) => <article key={item.id} className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{item.destinationName}</h3><span className="text-[0.68rem] capitalize text-muted-foreground">{item.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs text-muted-foreground">Requested {formatDate(item.requestedOn)}{item.effectiveOn ? ` · effective ${formatDate(item.effectiveOn)}` : ""}</p></article>) : <EmptyRecord>No transfer events are available for this learner.</EmptyRecord>) : <EmptyRecord>Transfer facts are not available to your current role.</EmptyRecord>}</div>
          </section>
        </div>

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
          This CRC is a composed view over authoritative ScolaPro domains. Attendance, official results, conduct, support metadata, transfers and guardian contact are read from their source records at view time; sensitive health, psychometric and counselling content remains separately permissioned and is never copied into an administrative duplicate.
        </section>
      </div>
    </AppShell>
  );
}
