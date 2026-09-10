"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BookOpenCheck, CalendarDays, FileQuestion, MessageSquareText } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import { AbsenceReviewList } from "@/features/parents/absence-review-list";
import type { AbsenceNoticeSummary } from "@/features/parents/server/absence-queries";
import type { AbsenceReviewFilters, AbsenceReviewWorkspace as Workspace } from "./server/absence-review-workspace";

type View = "daily" | "subject";

export function AbsenceReviewWorkspace({
  workspace,
  filters,
  view,
  notices,
}: {
  workspace: Workspace;
  filters: AbsenceReviewFilters;
  view: View;
  notices: AbsenceNoticeSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(patch: Partial<AbsenceReviewFilters> & { view?: View }) {
    const next = { ...filters, ...patch };
    const query = new URLSearchParams({ from: next.from, to: next.to, view: patch.view ?? view });
    if (next.learnerId) query.set("learner", next.learnerId);
    if (next.gradeId) query.set("grade", next.gradeId);
    if (next.classId) query.set("class", next.classId);
    if (next.subjectOfferingId && (patch.view ?? view) === "subject") query.set("subject", next.subjectOfferingId);
    if (next.reviewState && next.reviewState !== "all") query.set("review", next.reviewState);
    startTransition(() => router.push(`/school/absence-reviews?${query}`));
  }

  const gradeOptions = [...new Map(workspace.classes.filter((item) => item.gradeId).map((item) => [item.gradeId!, { value: item.gradeId!, label: item.gradeName }])).values()];
  const visibleClasses = filters.gradeId ? workspace.classes.filter((item) => item.gradeId === filters.gradeId) : workspace.classes;
  const rows = view === "daily" ? workspace.daily : workspace.subjectPeriod;

  return (
    <div className="space-y-5" aria-busy={pending}>
      <Summary workspace={workspace} />

      <div className="flex flex-wrap gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1" role="tablist" aria-label="Absence review view">
        <button type="button" role="tab" aria-selected={view === "daily"} onClick={() => navigate({ view: "daily", subjectOfferingId: undefined })} className={`min-h-9 rounded-[var(--radius-xs)] px-3 text-xs font-medium transition-colors duration-[var(--motion-fast)] ${view === "daily" ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}>Daily absences</button>
        <button type="button" role="tab" aria-selected={view === "subject"} onClick={() => navigate({ view: "subject" })} className={`min-h-9 rounded-[var(--radius-xs)] px-3 text-xs font-medium transition-colors duration-[var(--motion-fast)] ${view === "subject" ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}>Subject-period absences</button>
      </div>

      <section className="rounded-[var(--radius-md)] bg-surface-muted p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DateField label="From" name="absenceFrom" value={filters.from} onChange={(from) => from && navigate({ from })} max={filters.to} />
          <DateField label="To" name="absenceTo" value={filters.to} onChange={(to) => to && navigate({ to })} min={filters.from} />
          <Picker label="Learner" value={filters.learnerId ?? ""} onChange={(learnerId) => navigate({ learnerId: learnerId || undefined })} searchable options={[{ value: "", label: "All learners" }, ...workspace.learners.map((item) => ({ value: item.id, label: item.name }))]} placeholder="All learners" disabled={pending} />
          <Picker label="Grade" value={filters.gradeId ?? ""} onChange={(gradeId) => navigate({ gradeId: gradeId || undefined, classId: undefined })} options={[{ value: "", label: "All grades" }, ...gradeOptions]} placeholder="All grades" disabled={pending} />
          <Picker label="Class" value={filters.classId ?? ""} onChange={(classId) => navigate({ classId: classId || undefined })} options={[{ value: "", label: "All classes" }, ...visibleClasses.map((item) => ({ value: item.id, label: `${item.gradeName} · ${item.name}` }))]} placeholder="All classes" disabled={pending} />
          {view === "subject" ? <Picker label="Subject" value={filters.subjectOfferingId ?? ""} onChange={(subjectOfferingId) => navigate({ subjectOfferingId: subjectOfferingId || undefined })} options={[{ value: "", label: "All subjects" }, ...workspace.subjects.map((item) => ({ value: item.id, label: item.name }))]} placeholder="All subjects" disabled={pending} /> : null}
          <Picker label="Explanation / review" value={filters.reviewState ?? "all"} onChange={(reviewState) => navigate({ reviewState })} options={[{ value: "all", label: "All states" }, { value: "unexplained", label: "No parent explanation" }, { value: "submitted", label: "Awaiting review" }, { value: "under_review", label: "Under review" }, { value: "accepted", label: "Accepted" }, { value: "returned", label: "Returned" }, { value: "closed", label: "Closed" }]} placeholder="All states" disabled={pending} />
        </div>
      </section>

      {pending ? <div className="flex justify-center py-2"><Spinner /></div> : null}

      <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
          <h2 className="scolapro-section-title">{view === "daily" ? "Official daily absences" : "Subject-period absences"}</h2>
          <p className="scolapro-section-description">{view === "daily" ? "Official register records remain authoritative. Parent explanations are correlated for review but never change attendance automatically." : "Lesson attendance stays independent from the official daily register. Daily status and parent explanations are contextual only."}</p>
        </div>
        {rows.length ? (
          <div className="divide-y divide-border-subtle">
            {view === "daily" ? workspace.daily.map((row) => <DailyRow key={row.key} row={row} />) : workspace.subjectPeriod.map((row) => <SubjectRow key={row.key} row={row} />)}
          </div>
        ) : (
          <div className="px-5 py-10 text-center"><FileQuestion className="mx-auto size-6 text-muted-foreground" aria-hidden="true" /><h3 className="mt-3 text-sm font-semibold">No absences match these filters</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Try a different date range or clear learner, grade, class and review-state filters.</p></div>
        )}
      </section>

      {view === "daily" && workspace.canReviewNotices ? (
        <section>
          <div className="mb-3"><h2 className="scolapro-section-title">Parent explanations</h2><p className="scolapro-section-description">Review guardian notices separately from the official register. Accepted notices do not alter attendance.</p></div>
          <AbsenceReviewList notices={notices} />
        </section>
      ) : null}
    </div>
  );
}

function Summary({ workspace }: { workspace: Workspace }) {
  const items = [
    { label: "Daily absences", value: workspace.summary.dailyAbsences, icon: CalendarDays, tone: "scolapro-tone-brand", valueClass: "text-[color:var(--accent-indigo)]" },
    { label: "Unexplained daily", value: workspace.summary.unexplainedDailyAbsences, icon: FileQuestion, tone: "scolapro-tone-amber", valueClass: "text-[color:var(--accent-amber)]" },
    { label: "Parent explanations awaiting review", value: workspace.summary.awaitingReview, icon: MessageSquareText, tone: "scolapro-tone-mint", valueClass: "text-[color:var(--accent-mint)]" },
    { label: "Subject-period absences", value: workspace.summary.subjectPeriodAbsences, icon: BookOpenCheck, tone: "scolapro-tone-sky", valueClass: "text-[color:var(--accent-sky)]" },
  ];
  return <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)] sm:grid-cols-2 xl:grid-cols-4">{items.map((item, index) => { const Icon = item.icon; return <article key={item.label} className={`flex items-start justify-between gap-4 px-4 py-4 sm:px-5 ${index ? "border-t border-border-subtle sm:border-l sm:border-t-0 xl:border-t-0" : ""} ${index === 2 ? "sm:border-l-0 sm:border-t xl:border-l xl:border-t-0" : ""}`}><div><p className="text-xs font-medium text-muted-foreground">{item.label}</p><p className={`mt-2 text-2xl font-semibold tracking-[-0.04em] ${item.valueClass}`}>{item.value}</p></div><span className={`grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] ${item.tone}`}><Icon className="size-4" aria-hidden="true" /></span></article>; })}</div>;
}

function DailyRow({ row }: { row: Workspace["daily"][number] }) {
  const evidenceLabel = row.evidenceState === "available" ? "Evidence available" : row.evidenceState === "none" ? "No evidence attached" : "Evidence restricted";
  return <article className="px-4 py-4 sm:px-5"><div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,.8fr)_minmax(13rem,1fr)] lg:items-start"><div><p className="scolapro-record-title">{row.learnerName}</p><p className="mt-1 text-xs text-muted-foreground">{row.gradeName} · {row.className} · {row.date}</p></div><div><Status value={row.status} /><p className="mt-1.5 text-xs text-muted-foreground">{row.reason ?? "No official reason recorded"}</p>{row.note ? <p className="mt-1 text-xs text-muted-foreground">{row.note}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{evidenceLabel}</p></div><Explanation explanation={row.explanation} /></div></article>;
}

function SubjectRow({ row }: { row: Workspace["subjectPeriod"][number] }) {
  return <article className="px-4 py-4 sm:px-5"><div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(13rem,1fr)] lg:items-start"><div><p className="scolapro-record-title">{row.learnerName}</p><p className="mt-1 text-xs text-muted-foreground">{row.gradeName} · {row.className} · {row.date}</p><p className="mt-1 text-xs text-muted-foreground">Daily register: {row.dailyStatus ? row.dailyStatus.replaceAll("_", " ") : "No absence recorded"}</p></div><div><p className="text-sm font-medium">{row.subjectName}</p><p className="mt-1 text-xs text-muted-foreground">{row.periodName} · Teaching context: {row.teacherName}</p>{row.recordedBy ? <p className="mt-1 text-xs text-muted-foreground">Recorded by {row.recordedBy}</p> : null}<div className="mt-2"><Status value={row.status} /></div><p className="mt-1.5 text-xs text-muted-foreground">{row.reason ?? "No lesson reason recorded"}</p></div><Explanation explanation={row.explanation} contextual /></div></article>;
}

function Explanation({ explanation, contextual = false }: { explanation: Workspace["daily"][number]["explanation"]; contextual?: boolean }) {
  if (!explanation) return <div className="rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2.5"><p className="text-xs font-medium text-[color:var(--warning)]">No parent explanation</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{contextual ? "No overlapping guardian notice is shown for this lesson date." : "This daily absence remains unexplained by a guardian notice."}</p></div>;
  return <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-medium">Parent explanation</p><span className="rounded-[var(--radius-xs)] bg-surface px-2 py-1 text-[0.68rem] font-medium capitalize text-muted-foreground shadow-[var(--shadow-xs)]">{explanation.status.replaceAll("_", " ")}</span></div><p className="mt-1.5 text-xs text-muted-foreground">{explanation.reason} · {explanation.absenceFrom === explanation.absenceTo ? explanation.absenceFrom : `${explanation.absenceFrom} – ${explanation.absenceTo}`}</p>{explanation.message ? <p className="mt-1 text-xs text-muted-foreground">{explanation.message}</p> : null}{explanation.attachmentCount ? <p className="mt-1 text-xs text-muted-foreground">Guardian evidence: {explanation.attachmentCount} attachment{explanation.attachmentCount === 1 ? "" : "s"}</p> : null}</div>;
}

function Status({ value }: { value: string }) {
  const excused = value === "excused";
  return <span className={`inline-flex rounded-[var(--radius-xs)] px-2 py-1 text-[0.68rem] font-medium capitalize ${excused ? "bg-info-soft text-[color:var(--info)]" : "bg-danger-soft text-[color:var(--danger)]"}`}>{value.replaceAll("_", " ")}</span>;
}
