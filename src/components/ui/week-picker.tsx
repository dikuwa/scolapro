"use client";

import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

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
}: PeriodStepperProps) {
  return (
    <div
      className={cn(
        "grid min-h-10 min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated shadow-[var(--shadow-xs)] sm:min-w-52",
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
        className="grid min-h-10 place-items-center border-r border-border-subtle text-muted-foreground outline-none transition duration-[var(--motion-fast)] hover:bg-brand-soft hover:text-brand-strong focus-visible:bg-brand-soft focus-visible:text-brand-strong disabled:cursor-not-allowed disabled:opacity-45"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <div className="relative flex min-w-0 items-center justify-center gap-2 px-3 text-center text-xs font-semibold text-foreground" aria-live="polite">
        {pending ? <Spinner className="size-4 shrink-0 text-brand" /> : <Icon className="size-4 shrink-0 text-brand" aria-hidden="true" />}
        <span className="truncate">{valueLabel}</span>
      </div>
      <button
        type="button"
        disabled={pending || nextDisabled}
        onClick={onNext}
        aria-label={nextLabel}
        className="grid min-h-10 place-items-center border-l border-border-subtle text-muted-foreground outline-none transition duration-[var(--motion-fast)] hover:bg-brand-soft hover:text-brand-strong focus-visible:bg-brand-soft focus-visible:text-brand-strong disabled:cursor-not-allowed disabled:opacity-45"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function WeekPicker(props: Omit<PeriodStepperProps, "icon">) {
  return <PeriodStepper {...props} icon={CalendarRange} />;
}
