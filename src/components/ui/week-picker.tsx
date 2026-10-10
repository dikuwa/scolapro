"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { CalendarPanel, type CalendarDateStatus } from "@/components/ui/date-field";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type PeriodCalendarProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  min?: string;
  max?: string;
  rangeStart?: string;
  rangeEnd?: string;
  getDateStatus?: (value: string) => CalendarDateStatus | null;
};

type PeriodStepperProps = {
  valueLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  icon?: LucideIcon;
  pending?: boolean;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  className?: string;
  calendar?: PeriodCalendarProps;
};

export function PeriodStepper({
  valueLabel,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  icon: Icon = CalendarDays,
  pending = false,
  previousDisabled = false,
  nextDisabled = false,
  className,
  calendar,
}: PeriodStepperProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!calendarOpen) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setCalendarOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [calendarOpen]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative grid min-h-10 min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated shadow-[var(--shadow-xs)] sm:min-w-52",
        className,
      )}
      role="group"
      aria-label="Period navigation"
    >
      <button
        type="button"
        disabled={pending || previousDisabled}
        onClick={onPrevious}
        aria-label={previousLabel}
        className="grid min-h-10 place-items-center rounded-l-[var(--radius-sm)] border-r border-border-subtle text-muted-foreground outline-none transition duration-[var(--motion-fast)] hover:bg-brand-soft hover:text-brand-strong focus-visible:bg-brand-soft focus-visible:text-brand-strong disabled:cursor-not-allowed disabled:opacity-45"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      {calendar ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => setCalendarOpen((current) => !current)}
          aria-label={calendar.label}
          aria-expanded={calendarOpen}
          className="flex min-w-0 items-center justify-center gap-2 px-3 text-center text-xs font-semibold text-foreground outline-none transition duration-[var(--motion-fast)] hover:bg-brand-soft hover:text-brand-strong focus-visible:bg-brand-soft focus-visible:text-brand-strong focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Spinner className="size-4 shrink-0 text-brand" /> : <Icon className="size-4 shrink-0 text-brand" aria-hidden="true" />}
          <span className="truncate" aria-live="polite">{valueLabel}</span>
        </button>
      ) : (
        <div className="relative flex min-w-0 items-center justify-center gap-2 px-3 text-center text-xs font-semibold text-foreground" aria-live="polite">
          {pending ? <Spinner className="size-4 shrink-0 text-brand" /> : <Icon className="size-4 shrink-0 text-brand" aria-hidden="true" />}
          <span className="truncate">{valueLabel}</span>
        </div>
      )}
      <button
        type="button"
        disabled={pending || nextDisabled}
        onClick={onNext}
        aria-label={nextLabel}
        className="grid min-h-10 place-items-center rounded-r-[var(--radius-sm)] border-l border-border-subtle text-muted-foreground outline-none transition duration-[var(--motion-fast)] hover:bg-brand-soft hover:text-brand-strong focus-visible:bg-brand-soft focus-visible:text-brand-strong disabled:cursor-not-allowed disabled:opacity-45"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
      {calendarOpen && calendar ? (
        <CalendarPanel
          value={calendar.value}
          min={calendar.min}
          max={calendar.max}
          rangeStart={calendar.rangeStart}
          rangeEnd={calendar.rangeEnd}
          getDateStatus={calendar.getDateStatus}
          onSelect={calendar.onChange}
          onClose={() => setCalendarOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function WeekPicker(props: Omit<PeriodStepperProps, "icon">) {
  return <PeriodStepper {...props} icon={CalendarRange} />;
}
