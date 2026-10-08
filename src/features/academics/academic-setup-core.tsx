"use client";

import type { LucideIcon } from "lucide-react";
import { CalendarDays, CalendarRange, Network } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { RecordActionButton } from "@/components/ui/record-action-button";
import { cn } from "@/lib/utils";

type ActivePanel = "workflow" | "anchor" | "hod" | null;
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

function CoreSetupCard({
  icon: Icon,
  tone,
  title,
  description,
  active,
  actionKind,
  actionLabel,
  closeLabel,
  onToggle,
  panelId,
  children,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  description: string;
  active: boolean;
  actionKind: ActionKind;
  actionLabel: string;
  closeLabel: string;
  onToggle: () => void;
  panelId: string;
  children: ReactNode;
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
      <div className={cn("grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.72fr)] md:items-start")}>
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn(tone, "grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]")}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              {active ? (
                <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-0.5 text-[0.62rem] font-semibold text-brand-strong">
                  Editing
                </span>
              ) : null}
            </div>
            <p className="scolapro-section-description !mt-1">{description}</p>
          </div>
        </div>
        <div
          className={cn(
            "grid gap-4 border-t border-border-subtle pt-4 md:border-l md:border-t-0 md:pl-4 md:pt-0",
          )}
        >
          {children}
        </div>
      </div>

      <div className="mt-auto flex justify-end pt-4">
        <RecordActionButton
          label={active ? closeLabel : actionLabel}
          actionKind={actionKind}
          disclosure
          aria-controls={panelId}
          variant="soft"
          compact={false}
          expanded={active}
          onClick={onToggle}
          className="min-h-9 px-3 text-xs"
        />
      </div>
    </article>
  );
}

/**
 * Canonical balanced expansion: the summary stays full width and its editor
 * occupies the next full-width row. Never strand a short summary beside a
 * tall configuration form.
 */
function CoreSetupRow({
  summary,
  editor,
  open,
  panel,
}: {
  summary: ReactNode;
  editor: ReactNode;
  open: boolean;
  panel: "workflow" | "anchor" | "hod";
}) {
  return (
    <div className="grid min-w-0 gap-3" data-academic-setup-row={panel}>
      {summary}
      {open ? (
        <div
          id={`academic-setup-panel-${panel}`}
          className="min-w-0 [&>section]:mt-0"
          data-academic-setup-panel={panel}
        >
          {editor}
        </div>
      ) : null}
    </div>
  );
}

export function AcademicSetupCore({
  timetableModeLabel,
  cycleLength,
  anchorDate,
  anchorDay,
  rotating,
  hodScopeCount,
  timetableEditor,
  hodEditor,
}: {
  timetableModeLabel: string;
  cycleLength: number;
  anchorDate: string | null;
  anchorDay: number | null;
  rotating: boolean;
  hodScopeCount: number;
  timetableEditor: ReactNode;
  hodEditor: ReactNode;
}) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  const toggle = (panel: Exclude<ActivePanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  return (
    <section className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div>
        <h2 className="scolapro-section-title">Core academic setup</h2>
        <p className="scolapro-section-description">
          Review the current academic workflow first, then open only the configuration you need to change.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <CoreSetupRow
          open={activePanel === "workflow"}
          panel="workflow"
          editor={timetableEditor}
          summary={
            <CoreSetupCard
              icon={CalendarRange}
              tone="scolapro-tone-sky"
              title="Timetable workflow"
              description="Choose whether this school uses weekday names or a numbered rotating timetable cycle."
              active={activePanel === "workflow"}
              actionKind="edit"
              actionLabel="Edit timetable settings"
              closeLabel="Close timetable settings"
              panelId="academic-setup-panel-workflow"
              onToggle={() => toggle("workflow")}
            >
              <div className="grid grid-cols-2 gap-4">
                <SummaryMetric label="Day system" value={timetableModeLabel} />
                <SummaryMetric label="Cycle length" value={`${cycleLength} day${cycleLength === 1 ? "" : "s"}`} />
              </div>
            </CoreSetupCard>
          }
        />

        <CoreSetupRow
          open={activePanel === "anchor"}
          panel="anchor"
          editor={timetableEditor}
          summary={
            <CoreSetupCard
              icon={CalendarDays}
              tone="scolapro-tone-mint"
              title="Calendar anchor"
              description={
                rotating
                  ? "Set the official school date and rotating cycle day used for calendar resolution."
                  : "Weekday timetables use real weekday labels and do not require a rotating-cycle anchor."
              }
              active={activePanel === "anchor"}
              actionKind="edit"
              actionLabel="Edit calendar anchor"
              closeLabel="Close calendar settings"
              panelId="academic-setup-panel-anchor"
              onToggle={() => toggle("anchor")}
            >
              <div className="grid grid-cols-2 gap-4">
                <SummaryMetric label="Known school date" value={rotating ? (anchorDate ?? "Not configured") : "Not required"} />
                <SummaryMetric label="Cycle day" value={rotating && anchorDay ? `Day ${anchorDay}` : rotating ? "Not configured" : "Weekday"} />
              </div>
            </CoreSetupCard>
          }
        />

        <CoreSetupRow
          open={activePanel === "hod"}
          panel="hod"
          editor={hodEditor}
          summary={
            <CoreSetupCard
              icon={Network}
              tone="scolapro-tone-brand"
              title="HOD teaching scope"
              description="Assign explicit subject responsibilities to HODs."
              active={activePanel === "hod"}
              actionKind="manage"
              actionLabel="Manage HOD responsibilities"
              closeLabel="Close HOD responsibilities"
              panelId="academic-setup-panel-hod"
              onToggle={() => toggle("hod")}
            >
              <SummaryMetric
                label="Configured"
                value={`${hodScopeCount} HOD scope${hodScopeCount === 1 ? "" : "s"}`}
              />
            </CoreSetupCard>
          }
        />
      </div>
    </section>
  );
}
