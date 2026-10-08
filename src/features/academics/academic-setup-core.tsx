"use client";

import type { LucideIcon } from "lucide-react";
import { CalendarDays, CalendarRange, Network } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { CardActionToggle } from "@/components/ui/card-action-toggle";
import { cn } from "@/lib/utils";

type ActivePanel = "workflow" | "anchor" | "hod" | null;

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
  onToggle,
  panelId,
  children,
  editor,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
  panelId: string;
  children: ReactNode;
  editor: ReactNode;
}) {
  return (
    <article
      className={cn(
        "rounded-[var(--radius-md)] border bg-surface-elevated p-4 shadow-[var(--shadow-xs)] transition",
        active
          ? "border-[color:var(--brand)]/45 ring-4 ring-[color:var(--brand-soft)]/70"
          : "border-border-subtle",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn(tone, "grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]")}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="scolapro-section-description !mt-1">{description}</p>
          </div>
        </div>
        <CardActionToggle open={active} controls={panelId} onClick={onToggle} />
      </div>
      <div className="mt-4 border-t border-border-subtle pt-3">{children}</div>
      {active ? (
        <div id={panelId} className="mt-4 border-t border-border-subtle pt-4 [&>section]:mt-0 [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none" data-academic-setup-panel={panelId}>
          {editor}
        </div>
      ) : null}
    </article>
  );
}

export function AcademicSetupCore({
  timetableModeLabel,
  cycleLength,
  anchorDate,
  anchorDay,
  rotating,
  hodScopeCount,
  hodOverview,
  timetableEditor,
  anchorEditor,
  hodEditor,
}: {
  timetableModeLabel: string;
  cycleLength: number;
  anchorDate: string | null;
  anchorDay: number | null;
  rotating: boolean;
  hodScopeCount: number;
  hodOverview: ReactNode;
  timetableEditor: ReactNode;
  anchorEditor: ReactNode;
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
        <CoreSetupCard
              icon={CalendarRange}
              tone="scolapro-tone-sky"
              title="Timetable workflow"
              description="Choose whether this school uses weekday names or a numbered rotating timetable cycle."
              active={activePanel === "workflow"}
              panelId="academic-setup-panel-workflow"
              editor={timetableEditor}
              onToggle={() => toggle("workflow")}
            >
              <div className="grid grid-cols-2 gap-4">
                <SummaryMetric label="Day system" value={timetableModeLabel} />
                <SummaryMetric label="Cycle length" value={`${cycleLength} day${cycleLength === 1 ? "" : "s"}`} />
              </div>
        </CoreSetupCard>

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
              panelId="academic-setup-panel-anchor"
              editor={anchorEditor}
              onToggle={() => toggle("anchor")}
            >
              <div className="grid grid-cols-2 gap-4">
                <SummaryMetric label="Known school date" value={rotating ? (anchorDate ?? "Not configured") : "Not required"} />
                <SummaryMetric label="Cycle day" value={rotating && anchorDay ? `Day ${anchorDay}` : rotating ? "Not configured" : "Weekday"} />
              </div>
        </CoreSetupCard>

        <CoreSetupCard
              icon={Network}
              tone="scolapro-tone-brand"
              title="HOD teaching scope"
              description="Assign explicit subject responsibilities to HODs."
              active={activePanel === "hod"}
              panelId="academic-setup-panel-hod"
              editor={hodEditor}
              onToggle={() => toggle("hod")}
            >
              <SummaryMetric
                label="Configured"
                value={`${hodScopeCount} HOD scope${hodScopeCount === 1 ? "" : "s"}`}
              />
              {hodOverview}
        </CoreSetupCard>
      </div>
    </section>
  );
}
