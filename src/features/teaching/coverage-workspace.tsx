"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { recordTeachingActual, type CoverageActionState } from "@/features/teaching/server/coverage-actions";
import type { CoverageWorkspaceData } from "@/features/teaching/server/coverage-queries";
import { activateOfflineScope, offlineQueueSummary, type OfflineScope } from "@/lib/offline/db";
import { cacheTeachingCoverageSnapshot, queueTeachingActual, syncQueuedTeachingActuals } from "@/features/teaching/offline/coverage-queue";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COVERAGE_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "started", label: "Started" },
  { value: "partially_taught", label: "Partially taught" },
  { value: "taught", label: "Taught" },
  { value: "reinforcement_needed", label: "Reinforcement needed" },
  { value: "assessed", label: "Assessed" },
] as const;

const PERIOD_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} ${i + 1 === 1 ? "period" : "periods"}`,
}));

const COVERAGE_TONE: Record<string, string> = {
  not_started: "text-muted-foreground",
  started: "text-[color:var(--warning)]",
  partially_taught: "text-[color:var(--warning)]",
  taught: "text-[color:var(--success)]",
  reinforcement_needed: "text-[color:var(--warning)]",
  assessed: "text-brand-strong",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function coverageLabel(state: string): string {
  return COVERAGE_OPTIONS.find((o) => o.value === state)?.label ?? state;
}

function formatShort(date: string): string {
  try {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-NA", { day: "numeric", month: "short" });
  } catch {
    return date;
  }
}

function formatDate(date: string): string {
  try {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-NA", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return date;
  }
}

// ---------------------------------------------------------------------------
// RecordForm — inline form for recording a single teaching actual
// ---------------------------------------------------------------------------

const initialState: CoverageActionState = { success: false, message: "" };

function RecordForm({
  scheduleItemId,
  defaultDate,
  defaultPeriods,
  onDone,
  offlineScope,
}: {
  scheduleItemId: string;
  defaultDate: string;
  defaultPeriods: number;
  onDone: () => void;
  offlineScope: OfflineScope | null;
}) {
  const [state, formAction, pending] = useActionState(recordTeachingActual, initialState);
  const [taughtOn, setTaughtOn] = useState(defaultDate);
  const [periods, setPeriods] = useState(String(defaultPeriods));
  const [coverageState, setCoverageState] = useState("taught");
  const [reflection, setReflection] = useState("");
  const [compensatoryAction, setCompensatoryAction] = useState("");
  const [clientMutationId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      onDone();
    } else {
      toast.error(state.message);
    }
  }, [state, onDone]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (typeof navigator === "undefined" || navigator.onLine || !offlineScope) return;
    event.preventDefault();
    try {
      await queueTeachingActual(offlineScope, { clientMutationId, scheduleItemId, taughtOn, periodsUsed: Number(periods), coverageState, reflection, compensatoryAction });
      toast.success("Teaching actual saved on this device. It will sync when the connection returns.");
    } catch { toast.error("Teaching actual could not be stored on this device."); }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4">
      <input type="hidden" name="clientMutationId" value={clientMutationId} />
      <input type="hidden" name="scheduleItemId" value={scheduleItemId} />
      <p className="text-xs font-semibold text-foreground">Record actual teaching</p>
      <p className="text-[0.7rem] text-muted-foreground">
        The planned schedule item is not modified. Historical actuals are preserved.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <DateField
          label="Date taught"
          name="taughtOn"
          value={taughtOn}
          onChange={setTaughtOn}
          required
          max={defaultDate <= new Date().toISOString().slice(0, 10) ? undefined : new Date().toISOString().slice(0, 10)}
        />
        <Picker
          label="Periods used"
          name="periodsUsed"
          placeholder="Select periods"
          options={PERIOD_OPTIONS}
          value={periods}
          onChange={setPeriods}
        />
      </div>

      <Picker
        label="Coverage state"
        name="coverageState"
        placeholder="Select coverage state"
        options={[...COVERAGE_OPTIONS]}
        value={coverageState}
        onChange={setCoverageState}
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor={`reflection-${scheduleItemId}`}>
          Reflection <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id={`reflection-${scheduleItemId}`}
          name="reflection"
          rows={3}
          maxLength={3000}
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="What worked well, what needs revisiting…"
          className="block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground" htmlFor={`compensatory-${scheduleItemId}`}>
          Compensatory action <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id={`compensatory-${scheduleItemId}`}
          name="compensatoryAction"
          rows={2}
          maxLength={2000}
          value={compensatoryAction}
          onChange={(e) => setCompensatoryAction(e.target.value)}
          placeholder="Extra periods, alternative delivery method…"
          className="block w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" variant="primary" size="sm" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save actual"}
        </Button>
        <Button type="button" variant="neutral" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// ScheduleRow — one planned lesson with its actuals and optional record form
// ---------------------------------------------------------------------------

function ScheduleRow({
  item,
  actuals,
  today,
  canRecord,
  offlineScope,
}: {
  item: CoverageWorkspaceData["scheduleItems"][number];
  actuals: CoverageWorkspaceData["actuals"];
  today: string;
  canRecord: boolean;
  offlineScope: OfflineScope | null;
}) {
  const [open, setOpen] = useState(false);
  const itemActuals = actuals.filter((a) => a.scheduleItemId === item.itemId);
  const hasActual = itemActuals.length > 0;
  const latestActual = itemActuals[0]; // ordered by recorded_at desc
  const isPast = item.plannedOn <= today;

  return (
    <li className="py-3 first:pt-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{item.topic}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.unitCode} · {formatDate(item.plannedOn)} · {item.plannedPeriodCount}{" "}
            {item.plannedPeriodCount === 1 ? "period" : "periods"}
            {item.status === "moved" && item.movedTo ? ` · moved to ${formatShort(item.movedTo)}` : ""}
          </p>
          {hasActual && latestActual ? (
            <p className={`mt-1 text-[0.68rem] font-medium ${COVERAGE_TONE[latestActual.coverageState] ?? "text-foreground"}`}>
              {coverageLabel(latestActual.coverageState)} · taught {formatShort(latestActual.taughtOn)} ·{" "}
              {latestActual.periodsUsed} {latestActual.periodsUsed === 1 ? "period" : "periods"}
              {latestActual.reflection ? " · reflection recorded" : ""}
              {itemActuals.length > 1 ? ` · ${itemActuals.length} records` : ""}
            </p>
          ) : isPast ? (
            <p className="mt-1 text-[0.68rem] text-muted-foreground">No actual recorded yet</p>
          ) : null}
        </div>

        {canRecord && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Cancel recording actual" : "Record teaching actual"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            {open ? (
              <>
                <ChevronUp className="size-3.5" aria-hidden="true" /> Cancel
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" aria-hidden="true" />
                {hasActual ? "Add record" : "Record actual"}
              </>
            )}
          </button>
        )}
      </div>

      {open && canRecord && (
        <RecordForm
          scheduleItemId={item.itemId}
          defaultDate={item.plannedOn <= today ? item.plannedOn : today}
          defaultPeriods={item.plannedPeriodCount}
          onDone={() => setOpen(false)}
          offlineScope={offlineScope}
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// TeachingCoverageWorkspace — main export
// ---------------------------------------------------------------------------

export type TeachingCoverageWorkspaceProps = CoverageWorkspaceData & {
  /** Teacher/class_teacher may write; leadership views are read-only here. */
  canRecord: boolean;
  offlineScope: OfflineScope | null;
};

export function TeachingCoverageWorkspace({
  today,
  academicYear,
  allocations,
  scheduleItems,
  actuals,
  canRecord,
  offlineScope,
}: TeachingCoverageWorkspaceProps) {
  const [allocationId, setAllocationId] = useState(allocations[0]?.allocationId ?? "");
  const [offlineAttention, setOfflineAttention] = useState(0);

  useEffect(() => {
    if (!offlineScope) return;
    void cacheTeachingCoverageSnapshot(offlineScope, { academicYear, allocations, scheduleItems }).catch(() => undefined);
    let active = true;
    const sync = async () => {
      await activateOfflineScope(offlineScope);
      if (typeof navigator !== "undefined" && navigator.onLine) await syncQueuedTeachingActuals(offlineScope);
      const summary = await offlineQueueSummary(offlineScope);
      if (active) setOfflineAttention(summary.attention);
    };
    void sync();
    const onOnline = () => { void sync(); };
    const onQueue = () => { void sync(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("scolapro-offline-queue-changed", onQueue);
    return () => { active = false; window.removeEventListener("online", onOnline); window.removeEventListener("scolapro-offline-queue-changed", onQueue); };
  }, [academicYear, allocations, offlineScope, scheduleItems]);

  const allocationOptions = useMemo(
    () =>
      allocations.map((a) => ({
        value: a.allocationId,
        label: `${a.subjectName} — ${a.className}`,
        helper: a.gradeName,
      })),
    [allocations],
  );

  const visibleItems = useMemo(
    () => (allocationId ? scheduleItems.filter((s) => s.teacherAllocationId === allocationId) : []),
    [allocationId, scheduleItems],
  );

  const pastItems = visibleItems.filter((s) => s.plannedOn <= today);
  const upcomingItems = visibleItems.filter((s) => s.plannedOn > today);

  const taught = useMemo(() => {
    const itemIds = new Set(visibleItems.map((s) => s.itemId));
    return actuals.filter((a) => itemIds.has(a.scheduleItemId) && a.coverageState === "taught").length;
  }, [visibleItems, actuals]);

  const withActual = useMemo(() => {
    const itemIds = new Set(visibleItems.map((s) => s.itemId));
    return new Set(actuals.filter((a) => itemIds.has(a.scheduleItemId)).map((a) => a.scheduleItemId)).size;
  }, [visibleItems, actuals]);

  const outstanding = pastItems.filter((s) => !actuals.some((a) => a.scheduleItemId === s.itemId)).length;

  const offlineBanner = offlineAttention ? <p role="status" className="mt-3 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-xs font-medium text-[color:var(--warning)]">Some offline teaching actuals need attention because their current teaching scope changed.</p> : null;

  if (!allocations.length) {
    return (
      <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="size-4 text-brand" aria-hidden="true" />
          <h2 className="scolapro-section-title">Coverage &amp; reflection</h2>
        </div>
        <p className="scolapro-section-description">No teaching allocations found for {academicYear}.</p>
        {offlineBanner}
        <p className="mt-4 text-sm text-muted-foreground">
          Teaching actuals can only be recorded against governed teacher allocations for your current school.
          Contact your school administrator if allocations are missing.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* Allocation picker */}
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="size-4 text-brand" aria-hidden="true" />
          <h2 className="scolapro-section-title">Coverage &amp; reflection</h2>
        </div>
        <p className="scolapro-section-description">
          Record actual teaching against planned schedule items. Planned teaching is never rewritten.
          {!canRecord && " This view is read-only for your role."}
        </p>

        {offlineBanner}
        <div className="mt-4 max-w-sm">
          <Picker
            label="Subject and class"
            name="allocationId"
            placeholder="Select allocation"
            options={allocationOptions}
            value={allocationId}
            onChange={setAllocationId}
          />
        </div>

        {/* Summary strip */}
        {visibleItems.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[var(--radius-sm)] bg-surface-muted/50 px-3 py-2.5">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Scheduled</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">{visibleItems.length}</p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-surface-muted/50 px-3 py-2.5">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">With actuals</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">{withActual}</p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-surface-muted/50 px-3 py-2.5">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Taught</p>
              <p className="mt-0.5 text-lg font-semibold text-[color:var(--success)]">{taught}</p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-surface-muted/50 px-3 py-2.5">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Outstanding</p>
              <p className={`mt-0.5 text-lg font-semibold ${outstanding > 0 ? "text-[color:var(--warning)]" : "text-foreground"}`}>
                {outstanding}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Past / due lessons */}
      {pastItems.length > 0 && (
        <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <h2 className="scolapro-section-title">Past and due lessons</h2>
          <p className="scolapro-section-description">Lessons scheduled on or before today. Record actuals against items that have been taught.</p>
          <ul className="mt-4 divide-y divide-border-subtle" aria-label="Past and due lessons">
            {pastItems.map((item) => (
              <ScheduleRow key={item.itemId} item={item} actuals={actuals} today={today} canRecord={canRecord} offlineScope={offlineScope} />
            ))}
          </ul>
        </section>
      )}

      {/* Upcoming lessons */}
      {upcomingItems.length > 0 && (
        <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <h2 className="scolapro-section-title">Upcoming lessons</h2>
          <p className="scolapro-section-description">Planned future schedule. Actuals can be recorded in advance where teaching happened early.</p>
          <ul className="mt-4 divide-y divide-border-subtle" aria-label="Upcoming lessons">
            {upcomingItems.map((item) => (
              <ScheduleRow key={item.itemId} item={item} actuals={actuals} today={today} canRecord={canRecord} offlineScope={offlineScope} />
            ))}
          </ul>
        </section>
      )}

      {visibleItems.length === 0 && allocationId && (
        <section className="rounded-[var(--radius-md)] bg-surface p-5 shadow-[var(--shadow-xs)]">
          <h2 className="scolapro-section-title">No schedule items</h2>
          <p className="scolapro-section-description text-sm text-muted-foreground">
            No schedule items found for this allocation in {academicYear}. Schedule items are created from the connected pacing plan in the Teaching workspace.
          </p>
        </section>
      )}
    </div>
  );
}
