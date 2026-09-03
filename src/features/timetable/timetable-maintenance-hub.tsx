"use client";

import { useState } from "react";
import { CalendarClock, CalendarRange, Clock3, Layers3, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimetableCurrentMaintenance } from "@/features/timetable/timetable-current-maintenance";
import { TimetableOfferingMaintenance } from "@/features/timetable/timetable-offering-maintenance";
import { TimetablePeriodMaintenance } from "@/features/timetable/timetable-period-maintenance";
import { TimetablePlanManagement } from "@/features/timetable/timetable-plan-management";
import type { TimetableWorkspace } from "@/features/timetable/server/workspace";

type MaintenanceView = "current" | "future" | "offerings" | "periods";

const views: { id: MaintenanceView; label: string; description: string; icon: typeof Settings2 }[] = [
  { id: "current", label: "Current schedule", description: "Rooms & live slots", icon: CalendarClock },
  { id: "future", label: "Future plans", description: "Handovers & planned slots", icon: CalendarRange },
  { id: "offerings", label: "Offerings", description: "Periods per cycle", icon: Layers3 },
  { id: "periods", label: "Periods", description: "Names & lesson times", icon: Clock3 },
];

export function TimetableMaintenanceHub({ schoolId, academicYear, workspace }: { schoolId: string; academicYear: number; workspace: TimetableWorkspace }) {
  const [activeView, setActiveView] = useState<MaintenanceView>("current");

  return (
    <section className="mt-5 space-y-3" aria-labelledby="timetable-maintenance-heading">
      <div className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-3 shadow-[var(--shadow-xs)] sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><Settings2 className="size-4" aria-hidden="true" /></span>
            <div>
              <h2 id="timetable-maintenance-heading" className="scolapro-section-title">Timetable maintenance</h2>
              <p className="scolapro-section-description !mt-0 max-w-2xl">Review and correct existing timetable setup without mixing maintenance actions into the quick creation forms above.</p>
            </div>
          </div>

          <div role="group" aria-label="Timetable maintenance areas" className="grid grid-cols-2 gap-1.5 rounded-[var(--radius-sm)] bg-surface-muted p-1.5 sm:grid-cols-4 lg:min-w-[34rem]">
            {views.map((view) => {
              const Icon = view.icon;
              const active = activeView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveView(view.id)}
                  className={cn(
                    "flex min-h-12 min-w-0 items-center gap-2 rounded-[var(--radius-xs)] px-2.5 py-2 text-left outline-none transition duration-[var(--motion-fast)] focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]",
                    active ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:bg-surface/65 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active && "text-brand-strong")} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-[0.7rem] font-semibold">{view.label}</span>
                    <span className="mt-0.5 hidden truncate text-[0.6rem] text-muted-foreground sm:block">{view.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        {activeView === "current" ? <TimetableCurrentMaintenance workspace={workspace} /> : null}
        {activeView === "future" ? <TimetablePlanManagement workspace={workspace} /> : null}
        {activeView === "offerings" ? <TimetableOfferingMaintenance schoolId={schoolId} academicYear={academicYear} offerings={workspace.offerings} /> : null}
        {activeView === "periods" ? <TimetablePeriodMaintenance schoolId={schoolId} academicYear={academicYear} periods={workspace.periods} /> : null}
      </div>
    </section>
  );
}
