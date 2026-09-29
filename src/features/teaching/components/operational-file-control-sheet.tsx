import { CircleAlert, CircleCheck, ClipboardCheck, History, RotateCcw } from "lucide-react";
import type { OperationalFileControlSheet, OperationalControlSheetRow } from "@/features/teaching/server/operational-file-control-sheet";
import type { OperationalTeachingFilesWorkspace } from "@/features/teaching/server/operational-files-workspace";

function statusTone(status: string) {
  if (status === "reviewed") return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
  if (status === "returned") return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
  return "bg-brand-soft text-brand-strong";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-NA", {
        timeZone: "Africa/Windhoek",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(parsed);
}

function ReviewRow({ row }: { row: OperationalControlSheetRow }) {
  return (
    <article className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold break-words">{row.label}</h4>
          <p className="mt-1 text-[0.68rem] text-muted-foreground">
            {row.subjectLabel ? `${row.subjectLabel} · ` : ""}
            {row.reviewPeriod ?? "Explicit teacher submission"}
            {row.itemCount !== null ? ` · ${row.itemCount} item${row.itemCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <span className={"inline-flex w-fit shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide " + statusTone(row.status)}>
          {row.status === "reviewed" ? <CircleCheck className="size-3.5" aria-hidden="true" /> : row.status === "returned" ? <RotateCcw className="size-3.5" aria-hidden="true" /> : <CircleAlert className="size-3.5" aria-hidden="true" />}
          {row.status}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-[0.68rem] sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Submitted</dt>
          <dd className="mt-0.5 font-medium">{formatDate(row.submittedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Reviewed</dt>
          <dd className="mt-0.5 font-medium">{formatDate(row.reviewedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Current review state</dt>
          <dd className="mt-0.5 font-medium capitalize">{row.status}</dd>
        </div>
      </dl>

      {row.reviewNote ? (
        <p className="mt-3 whitespace-pre-wrap break-words rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2 text-[0.68rem] leading-4">
          {row.reviewNote}
        </p>
      ) : null}

      {row.events.length ? (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-[0.68rem] font-semibold">
            <History className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Review history
          </div>
          <ol className="mt-1.5 space-y-1.5">
            {row.events.slice(-4).map((event) => (
              <li key={event.id} className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-2 text-[0.68rem]">
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  <span className="font-medium capitalize">{event.eventKind}</span>
                  <span className="text-muted-foreground">{event.actorRole.replaceAll("_", " ")}</span>
                  <span className="text-muted-foreground">{formatDate(event.occurredAt)}</span>
                </div>
                {event.comment ? <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{event.comment}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </article>
  );
}

export function OperationalFileControlSheetView({
  workspace,
  controlSheet,
}: {
  workspace: OperationalTeachingFilesWorkspace;
  controlSheet: OperationalFileControlSheet;
}) {
  const evidence = workspace.allocations.flatMap((allocation) =>
    allocation.fileTypes.flatMap((fileType) =>
      fileType.sections.flatMap((section) => section.items.map((item) => item.evidence)),
    ),
  );
  const ready = evidence.filter((item) => item.status === "resolved" || item.status === "external").length;
  const needsAttention = evidence.filter((item) => item.status === "missing" || item.status === "unavailable").length;
  const manual = evidence.filter((item) => item.status === "manual").length;
  const reviewRows = [...controlSheet.preparationRows, ...controlSheet.professionalFileRows];

  if (!evidence.length && !reviewRows.length) return null;

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]">
          <ClipboardCheck className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="scolapro-section-title">Control sheet & monitoring</h2>
          <p className="scolapro-section-description">
            Readiness and review are shown separately. A linked or available item is not treated as HOD-reviewed unless an existing review event proves it.
          </p>
        </div>
      </div>

      {evidence.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
            <p className="text-[0.68rem] text-muted-foreground">Available / linked</p>
            <p className="mt-1 text-lg font-semibold">{ready}</p>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
            <p className="text-[0.68rem] text-muted-foreground">Missing / unavailable</p>
            <p className="mt-1 text-lg font-semibold">{needsAttention}</p>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
            <p className="text-[0.68rem] text-muted-foreground">Manual requirements</p>
            <p className="mt-1 text-lg font-semibold">{manual}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="text-sm font-semibold">Existing review history</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Preparation review uses the existing preparation submission lifecycle. Uploaded professional evidence uses the existing professional-file review lifecycle.
        </p>
        {controlSheet.preparationUnavailable || controlSheet.professionalFileUnavailable ? (
          <div className="mt-3 space-y-2">
            {controlSheet.preparationUnavailable ? (
              <p className="rounded-[var(--radius-sm)] bg-[color:var(--warning-soft)] px-3 py-3 text-sm text-[color:var(--warning)]">
                {controlSheet.preparationUnavailable}
              </p>
            ) : null}
            {controlSheet.professionalFileUnavailable ? (
              <p className="rounded-[var(--radius-sm)] bg-[color:var(--warning-soft)] px-3 py-3 text-sm text-[color:var(--warning)]">
                {controlSheet.professionalFileUnavailable}
              </p>
            ) : null}
          </div>
        ) : null}
        {reviewRows.length ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {reviewRows.map((row) => <ReviewRow key={`${row.source}:${row.id}`} row={row} />)}
          </div>
        ) : !controlSheet.preparationUnavailable && !controlSheet.professionalFileUnavailable ? (
          <p className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3 text-sm text-muted-foreground">
            No existing review submissions are recorded for this teacher in the current scope.
          </p>
        ) : null}
      </div>
    </section>
  );
}
