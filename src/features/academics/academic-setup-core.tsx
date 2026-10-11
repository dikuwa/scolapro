"use client";

import type { LucideIcon } from "lucide-react";
import { CalendarDays, CalendarRange, Network } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { ConfigurationCard } from "@/components/ui/configuration-card";

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
  disabled = false,
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
  disabled?: boolean;
}) {
  return (
    <ConfigurationCard
      icon={Icon}
      tone={tone}
      title={title}
      description={description}
      open={active}
      onToggle={onToggle}
      panelId={panelId}
      summary={children}
      editor={editor}
      disabled={disabled}
    />
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
              disabled={!rotating}
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
