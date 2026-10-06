"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, ClipboardList, ListChecks, NotebookTabs } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { AttendanceSortDirection } from "@/features/attendance/server/register";

export function AttendanceViewTabs({
  view,
  date,
  requestedClass,
  weekDate,
  sort = "asc",
}: {
  view: "day" | "week" | "register" | "official" | "absences";
  date: string;
  requestedClass?: string;
  weekDate: string;
  sort?: AttendanceSortDirection;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(nextView: "day" | "week" | "register" | "official" | "absences") {
    if (nextView === view || pending) return;
    const params = new URLSearchParams();
    params.set("view", nextView);
    params.set("date", nextView === "week" || nextView === "official" ? weekDate : date);
    if (requestedClass) params.set("class", requestedClass);
    if (sort === "desc") params.set("sort", "desc");
    startTransition(() => router.replace(`/attendance?${params.toString()}`, { scroll: false }));
  }

  const tabs: { value: "day" | "week" | "register" | "official" | "absences"; label: string; icon: typeof CalendarDays }[] = [
    { value: "day", label: "Day", icon: CalendarDays },
    { value: "week", label: "Week", icon: CalendarRange },
    { value: "register", label: "Register", icon: NotebookTabs },
    { value: "official", label: "Official", icon: ClipboardList },
    { value: "absences", label: "Absences", icon: ListChecks },
  ];

  return (
    <div className="flex min-h-10 w-full max-w-full items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1 sm:inline-flex sm:w-fit" aria-label="Attendance view">
      {tabs.map(({ value: item, label, icon: TabIcon }) => (
        <button
          key={item}
          type="button"
          disabled={pending}
          onClick={() => navigate(item)}
          className={`inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-2 text-xs font-medium transition sm:flex-none sm:px-3 ${view === item ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}
        >
          {pending && item !== view ? <Spinner className="size-3.5 text-brand" /> : <TabIcon className="hidden size-3.5 sm:block" aria-hidden="true" />}
          {label}
        </button>
      ))}
    </div>
  );
}
