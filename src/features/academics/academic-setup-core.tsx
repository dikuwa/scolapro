"use client";

import type { LucideIcon } from "lucide-react";
import { CalendarDays, CalendarRange, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { RecordActionButton } from "@/components/ui/record-action-button";
import { cn } from "@/lib/utils";

type ActivePanel = "workflow" | "anchor" | null;
type ActionKind = "edit" | "manage";

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[0.68rem] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

/**
 * A single core-setup card.
 *
 * The compact summary is the default read-only view. Opening the editor
 * replaces that summary content inside the same card — it never renders a
 * second panel, duplicate heading, description or an unrelated editing column.
 */
function CoreSetupCard({
  icon: Icon,
  tone,
  title,
  description,
  statusLabel,
  active,
  actionKind,
  actionLabel,
  closeLabel,
  actionDisabled,
  onToggle,
  summary,
  editor,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  description: string;
  statusLabel: string;
  active: boolean;
  actionKind: ActionKind;
  actionLabel: string;
  closeLabel: string;
  actionDisabled?: boolean;
  onToggle: () => void;
  summary: ReactNode;
  editor: ReactNode;
}) {
  return (
    <article
      className={cn(
        "flex min-h-[11.5rem] flex-col rounded-[var(--radius-md)] border bg-surface-elevated p-4 shadow-[var(--shadow-xs)] transition",
        active
          ? "border-[color:var(--brand)]/45 ring-4 ring-[color:var(--brand-soft)]/70"
          : "border-border-subtle",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn(tone, "grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]")}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {active ? (
              <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-0.5 text-[0.62rem] font-semibold text-brand-strong">
                Active
              </span>
            ) : null}
          </div>
          <p className="scolapro-section-description !mt-1">{description}</p>
        </div>
      </div>

      <div className="mt-4 min-w-0" data-core-setup-content={active ? "editor" : "summary"}>
        {active ? editor : summary}
      </div>

      <div className="mt-auto flex justify-end pt-4">
        {actionDisabled ? (
          <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-medium text-muted-foreground">
            {statusLabel}
          </span>
        ) : (
          <RecordActionButton
            label={active ? closeLabel : actionLabel}
            icon={active ? X : undefined}
            actionKind={active ? undefined : actionKind}
            variant="soft"
            compact={false}
            expanded={active}
            onClick={onToggle}
            className="min-h-9 px-3 text-xs"
          />
        )}
      </div>
    </article>
  );
}

export function AcademicSetupCore({
  timetableModeLabel,
  cycleLength,
  anchorDate,
  anchorDay,
  rotating,
  workflowEditor,
  anchorEditor,
}: {
  timetableModeLabel: string;
  cycleLength: number;
  anchorDate: string | null;
  anchorDay: number | null;
  rotating: boolean;
  workflowEditor: ReactNode;
  anchorEditor: ReactNode;
}) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  const toggle = (panel: Exclude<ActivePanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  const workflowStatus = "Configured";
  const anchorConfigured = Boolean(anchorDate && anchorDay);
  const anchorStatus = rotating ? (anchorConfigured ? "Configured" : "Not configured") : "Not required";

  return (
    <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div>
        <h2 className="scolapro-section-title">Core academic setup</h2>
        <p className="scolapro-section-description">
          Review the current academic workflow, then open only the configuration you need to change. Editors replace the
          summary inside the same card.
        </p>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2 lg:items-start">
        <CoreSetupCard
          icon={CalendarRange}
          tone="scolapro-tone-sky"
          title="Timetable workflow"
          description="Choose whether this school uses weekday names or a numbered rotating timetable cycle."
          statusLabel={workflowStatus}
          active={activePanel === "workflow"}
          actionKind="edit"
          actionLabel="Edit timetable settings"
          closeLabel="Close timetable settings"
          onToggle={() => toggle("workflow")}
          editor={workflowEditor}
          summary={
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <SummaryMetric label="Day system" value={timetableModeLabel} />
              <SummaryMetric label="Cycle length" value={`${cycleLength} day${cycleLength === 1 ? "" : "s"}`} />
              <SummaryMetric label="Configuration status" value={workflowStatus} />
            </div>
          }
        />

        <CoreSetupCard
          icon={CalendarDays}
          tone="scolapro-tone-mint"
          title="Calendar anchor"
          description={
            rotating
              ? "Set the official school date and rotating cycle day used for calendar resolution."
              : "Weekday timetables use real weekday labels and do not require a rotating-cycle anchor."
          }
          statusLabel={anchorStatus}
          active={activePanel === "anchor"}
          actionKind="edit"
          actionLabel={anchorConfigured ? "Edit calendar anchor" : "Configure calendar anchor"}
          closeLabel="Close calendar settings"
          actionDisabled={!rotating}
          onToggle={() => toggle("anchor")}
          editor={anchorEditor}
          summary={
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <SummaryMetric label="Known school date" value={rotating ? (anchorDate ?? "Not configured") : "Not required"} />
              <SummaryMetric label="Cycle day" value={rotating && anchorDay ? `Day ${anchorDay}` : rotating ? "Not configured" : "Weekday"} />
              <SummaryMetric label="Configuration status" value={anchorStatus} />
            </div>
          }
        />
      </div>
    </section>
  );
}
