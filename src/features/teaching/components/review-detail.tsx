"use client";

import { useActionState, useEffect } from "react";
import { CheckCircle2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reviewSubmission, type ReviewActionState } from "@/features/teaching/server/review-actions";
import type { ReviewDetail as ReviewDetailData, ReviewSubmissionItem } from "@/features/teaching/server/review-queries";

const initialState: ReviewActionState = { success: false, message: "" };

/**
 * Same teacher-facing preparation fields used by the teaching workspace, kept in
 * the reviewer order. Reviewer rendering is read-only: nothing here writes to the
 * teacher preparation.
 */
const preparationFieldLabels: Array<[string, string]> = [
  ["resources", "Resources / materials"],
  ["introduction", "Introduction"],
  ["lessonStructure", "Lesson structure"],
  ["teacherActivities", "Teacher activities"],
  ["learnerActivities", "Learner activities"],
  ["consolidation", "Consolidation"],
  ["assessment", "Assessment / homework / tasks / exercises"],
  ["homeworkMonitoring", "Homework monitoring"],
  ["englishAcrossCurriculum", "English Across Curriculum"],
  ["compensatoryTeaching", "Compensatory teaching"],
  ["reflectionAmendments", "Reflection / amendments"],
];

const statusTone: Record<string, string> = {
  submitted: "bg-brand-soft text-brand-strong",
  reviewed: "bg-success-soft text-[color:var(--success)]",
  returned: "bg-warning-soft text-[color:var(--warning)]",
};

function fieldLabel(key: string) {
  const known = preparationFieldLabels.find(([name]) => name === key);
  if (known) return known[1];
  const fallback = key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/[_-]+/g, " ").trim();
  return fallback ? fallback.charAt(0).toUpperCase() + fallback.slice(1) : key;
}

function preparationEntries(preparation: Record<string, string>) {
  const known = preparationFieldLabels
    .filter(([key]) => preparation[key])
    .map(([key, label]) => [key, label] as const);
  const extra = Object.keys(preparation)
    .filter((key) => !preparationFieldLabels.some(([name]) => name === key))
    .sort()
    .map((key) => [key, fieldLabel(key)] as const);
  return [...known, ...extra];
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.64rem] font-medium capitalize", statusTone[status] ?? "bg-surface-muted text-muted-foreground")}>
      {status}
    </span>
  );
}

function DefinitionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function SubmissionSummary({ data }: { data: ReviewDetailData }) {
  const teachers = [...new Set(data.items.map((item) => item.teacherName).filter((value): value is string => Boolean(value)))];
  const subjects = [...new Set(data.items.map((item) => item.subjectLabel).filter((value): value is string => Boolean(value)))];
  return (
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="scolapro-section-title">Submission scope</h2>
          <p className="scolapro-section-description">Current oversight state of this submission. Teacher preparation content stays read-only for reviewers.</p>
        </div>
        <StatusBadge status={data.submission.status} />
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DefinitionRow label="Scope" value={data.submission.scopeLabel} />
        <DefinitionRow label="Teacher" value={teachers.length ? teachers.join(", ") : "Not recorded"} />
        <DefinitionRow label="Subject" value={subjects.length ? subjects.join(", ") : "Not recorded"} />
        <DefinitionRow label="Academic year" value={String(data.submission.academicYear)} />
        <DefinitionRow label="Preparations" value={String(data.submission.itemCount)} />
        <DefinitionRow label="Submitted" value={data.submission.submittedAtLabel ?? data.submission.submittedOn ?? "Not recorded"} />
        <DefinitionRow label="Last review" value={data.submission.reviewedAtLabel ?? "Not reviewed yet"} />
      </dl>
      {data.submission.reviewNote ? (
        <p className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-xs text-muted-foreground break-words">
          Review note: {data.submission.reviewNote}
        </p>
      ) : null}
    </section>
  );
}

function PreparationItem({ item, index, total }: { item: ReviewSubmissionItem; index: number; total: number }) {
  const entries = preparationEntries(item.preparation);
  const heading = [item.subjectLabel, item.gradeLabel, item.registerClassLabel].filter(Boolean).join(" · ");
  return (
    <article className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="scolapro-record-title break-words">{heading || "Lesson preparation"}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground break-words">
            Preparation {index + 1} of {total}
            {item.teacherName ? ` · ${item.teacherName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.preparationStatusSnapshot} />
          {item.lessonStatus ? (
            <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-0.5 text-[0.64rem] font-medium capitalize text-muted-foreground">
              Lesson {item.lessonStatus}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DefinitionRow label="Teacher" value={item.teacherName ?? "Not recorded"} />
        <DefinitionRow label="Lesson date" value={item.plannedOnLabel ?? "Not scheduled"} />
        <DefinitionRow label="Planned periods" value={item.plannedPeriodCount ? String(item.plannedPeriodCount) : "Not recorded"} />
        <DefinitionRow label="Status at submission" value={item.preparationStatusSnapshot} />
      </dl>

      <div className="mt-5">
        <h4 className="scolapro-section-title">Teacher preparation</h4>
        <p className="scolapro-section-description">Authored by the teacher. Read-only for reviewers; a review never overwrites this content.</p>
        {entries.length ? (
          <dl className="mt-3 space-y-2">
            {entries.map(([key, label]) => (
              <div key={key} className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{item.preparation[key]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No teacher-authored preparation content was recorded for this lesson.</p>
        )}
      </div>

      {item.curriculum ? (
        <div className="mt-5">
          <h4 className="scolapro-section-title">Connected curriculum context</h4>
          <p className="scolapro-section-description">Official curriculum values connected to this preparation when it was saved.</p>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <DefinitionRow label="Curriculum version" value={item.curriculum.version ?? "Not recorded"} />
            <DefinitionRow label="Theme" value={item.curriculum.theme ?? "Not recorded"} />
            <DefinitionRow label="Topic" value={item.curriculum.topic ?? "Not recorded"} />
          </dl>
          {item.curriculum.objectives.length ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">Objectives</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">
                {item.curriculum.objectives.map((objective) => (
                  <li key={objective} className="break-words">{objective}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {item.curriculum.competencies.length ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">Competencies</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">
                {item.curriculum.competencies.map((competency) => (
                  <li key={competency} className="break-words">{competency}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ReviewHistory({ events }: { events: ReviewDetailData["events"] }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Review history</h2>
      <p className="scolapro-section-description">
        Append-only provenance in historical order. Events and earlier reviewer provenance are never edited or deleted.
      </p>
      {events.length ? (
        <ol className="mt-4 space-y-3">
          {events.map((event) => (
            <li key={event.id} className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium capitalize text-foreground">{event.eventKind}</span>
                <span className="rounded-[var(--radius-xs)] bg-surface px-2 py-0.5 text-[0.64rem] font-medium capitalize text-muted-foreground">
                  {event.actorRoleSnapshot.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-muted-foreground">{event.occurredAtLabel ?? event.occurredAt}</span>
              </div>
              {event.comment ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{event.comment}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No review history yet.</p>
      )}
    </section>
  );
}

function ReviewActions({ submissionId, status }: { submissionId: string; status: string }) {
  const [state, action, pending] = useActionState(reviewSubmission, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  if (status !== "submitted") {
    return (
      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Review action</h2>
        <p className="scolapro-section-description">
          This submission is already {status}. Only submitted preparations can be reviewed or returned, and historical review records stay unchanged.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Review action</h2>
      <p className="scolapro-section-description">
        Reviewing or returning appends an immutable review record and updates only the submission status. The teacher preparation content is never changed.
      </p>
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="submissionId" value={submissionId} />
        <div className="min-w-0">
          <label htmlFor="review-comment" className="text-xs font-medium text-foreground">Feedback / comment</label>
          <textarea
            id="review-comment"
            name="comment"
            rows={4}
            maxLength={2000}
            className="mt-1.5 min-h-[96px] w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
          />
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Optional. Stored on the governed review record for the teacher.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="submit" name="action" value="reviewed" variant="success" loading={pending} className="w-full sm:w-auto">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            Mark reviewed
          </Button>
          <Button type="submit" name="action" value="returned" variant="danger" loading={pending} className="w-full sm:w-auto">
            <Undo2 className="size-4 shrink-0" aria-hidden="true" />
            Return for revision
          </Button>
        </div>
        {state.message ? (
          <p
            aria-live="polite"
            className={cn("text-xs break-words", state.success ? "text-[color:var(--success)]" : "text-[color:var(--danger)]")}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

/**
 * Reviewer detail view for one preparation submission. Teacher-authored
 * preparation content and the connected curriculum context are presented
 * read-only; the only reviewer-caused change is the governed review action.
 */
export function ReviewDetail({ data }: { data: ReviewDetailData }) {
  return (
    <div className="space-y-5">
      <SubmissionSummary data={data} />

      <section className="space-y-4">
        <div>
          <h2 className="scolapro-section-title">Submitted preparation content</h2>
          <p className="scolapro-section-description">What the teacher prepared for each lesson grouped in this submission.</p>
        </div>
        {data.items.length ? (
          data.items.map((item, index) => (
            <PreparationItem key={item.lessonPreparationId} item={item} index={index} total={data.items.length} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No preparation items are connected to this submission.</p>
        )}
      </section>

      <ReviewHistory events={data.events} />
      <ReviewActions submissionId={data.submission.id} status={data.submission.status} />
    </div>
  );
}