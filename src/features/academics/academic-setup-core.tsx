"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { CalendarDays, CalendarRange, Network } from "lucide-react";
import { Button } from "@/components/ui/button";

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

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <article className="flex min-h-[13.5rem] flex-col rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-4 shadow-[var(--shadow-xs)]">
          <div className="flex items-start gap-3">
            <span className="scolapro-tone-sky grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
              <CalendarRange className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Timetable workflow</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Choose whether this school uses weekday names or a numbered rotating timetable cycle.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border-subtle pt-4">
            <SummaryMetric label="Day system" value={timetableModeLabel} />
            <SummaryMetric label="Cycle length" value={`${cycleLength} day${cycleLength === 1 ? "" : "s"}`} />
          </div>
          <div className="mt-auto pt-4">
            <Button
              type="button"
              variant="soft"
              className="w-full"
              aria-expanded={activePanel === "workflow"}
              onClick={() => toggle("workflow")}
            >
              {activePanel === "workflow" ? "Close timetable settings" : "Edit timetable settings"}
            </Button>
          </div>
        </article>

        <article className="flex min-h-[13.5rem] flex-col rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-4 shadow-[var(--shadow-xs)]">
          <div className="flex items-start gap-3">
            <span className="scolapro-tone-mint grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
              <CalendarDays className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Calendar anchor</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {rotating
                  ? "Set the official school date and rotating cycle day used for calendar resolution."
                  : "Weekday timetables use real weekday labels and do not require a rotating-cycle anchor."}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border-subtle pt-4">
            <SummaryMetric label="Known school date" value={rotating ? (anchorDate ?? "Not configured") : "Not required"} />
            <SummaryMetric label="Cycle day" value={rotating && anchorDay ? `Day ${anchorDay}` : rotating ? "Not configured" : "Weekday"} />
          </div>
          <div className="mt-auto pt-4">
            <Button
              type="button"
              variant="soft"
              className="w-full"
              aria-expanded={activePanel === "anchor"}
              onClick={() => toggle("anchor")}
            >
              {activePanel === "anchor" ? "Close calendar settings" : "Edit calendar anchor"}
            </Button>
          </div>
        </article>

        <article className="flex min-h-[13.5rem] flex-col rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-4 shadow-[var(--shadow-xs)]">
          <div className="flex items-start gap-3">
            <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
              <Network className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">HOD teaching scope</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Assign explicit subject responsibilities to HODs.
              </p>
            </div>
          </div>
          <div className="mt-4 border-t border-border-subtle pt-4">
            <SummaryMetric
              label="Configured"
              value={`${hodScopeCount} HOD scope${hodScopeCount === 1 ? "" : "s"}`}
            />
          </div>
          <div className="mt-auto pt-4">
            <Button
              type="button"
              variant="soft"
              className="w-full"
              aria-expanded={activePanel === "hod"}
              onClick={() => toggle("hod")}
            >
              {activePanel === "hod" ? "Close HOD responsibilities" : "Manage HOD responsibilities"}
            </Button>
          </div>
        </article>
      </div>

      {activePanel === "workflow" || activePanel === "anchor" ? (
        <div className="mt-4 border-t border-border-subtle pt-4" data-academic-setup-panel="timetable">
          {timetableEditor}
        </div>
      ) : null}

      {activePanel === "hod" ? (
        <div className="mt-4 border-t border-border-subtle pt-4 [&>section]:mt-0" data-academic-setup-panel="hod">
          {hodEditor}
        </div>
      ) : null}
    </section>
  );
}
