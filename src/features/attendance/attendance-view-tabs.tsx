"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, ClipboardList, ListChecks, NotebookTabs } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

export function AttendanceViewTabs({
  view,
  date,
  requestedClass,
  weekDate,
}: {
  view: "day" | "week" | "register" | "official" | "absences";
  date: string;
  requestedClass?: string;
  weekDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(nextView: "day" | "week" | "register" | "official" | "absences") {
    if (nextView === view || pending) return;
    const currentParams = new URLSearchParams(window.location.search);
    const currentSort = currentParams.get("sort") === "desc" ? "desc" : "asc";
    const currentSexParam = currentParams.get("sex");
    const currentSexFilter = currentSexParam === "male" || currentSexParam === "female" ? currentSexParam : "all";
    const params = new URLSearchParams();
    params.set("view", nextView);
    params.set("date", nextView === "week" || nextView === "official" ? weekDate : date);
    if (requestedClass) params.set("class", requestedClass);
    if (currentSort === "desc") params.set("sort", "desc");
    if (currentSexFilter !== "all") params.set("sex", currentSexFilter);
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
          aria-current={view === item ? "page" : undefined}
          onClick={() => navigate(item)}
          className={`inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-2 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/35 sm:flex-none sm:px-3 ${view === item ? "bg-brand-soft text-brand-strong shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}
        >
          {pending && item !== view ? <Spinner className="size-3.5 text-brand" /> : <TabIcon className="hidden size-3.5 sm:block" aria-hidden="true" />}
          {label}
        </button>
      ))}
    </div>
  );
}
