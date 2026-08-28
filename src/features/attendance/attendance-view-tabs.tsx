"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

export function AttendanceViewTabs({
  view,
  date,
  requestedClass,
  weekDate,
}: {
  view: "day" | "week";
  date: string;
  requestedClass?: string;
  weekDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(nextView: "day" | "week") {
    if (nextView === view || pending) return;
    const classParam = requestedClass ? `&class=${encodeURIComponent(requestedClass)}` : "";
    const targetDate = nextView === "week" ? weekDate : date;
    startTransition(() => router.replace(`/attendance?view=${nextView}&date=${targetDate}${classParam}`, { scroll: false }));
  }

  return (
    <div className="inline-flex min-h-10 w-fit items-center gap-1 rounded-[var(--radius-sm)] bg-surface-muted p-1" aria-label="Attendance view">
      {(["day", "week"] as const).map((item) => (
        <button
          key={item}
          type="button"
          disabled={pending}
          onClick={() => navigate(item)}
          className={`inline-flex min-h-8 min-w-[4.25rem] items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-3 text-xs font-medium transition ${view === item ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}
        >
          {pending && item !== view ? <Spinner className="size-3.5 text-brand" /> : null}
          {item === "day" ? "Day" : "Week"}
        </button>
      ))}
    </div>
  );
}
