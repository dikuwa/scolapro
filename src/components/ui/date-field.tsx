"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function parseIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayIndex);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

type PickerMode = "calendar" | "year" | "month";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function DateField({
  label,
  name,
  value,
  onChange,
  required = false,
  error,
  min,
  max,
  className,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  min?: string;
  max?: string;
  className?: string;
}) {
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => selected ?? new Date());
  const [pickerMode, setPickerMode] = useState<PickerMode>("calendar");
  const rootRef = useRef<HTMLDivElement>(null);
  const errorId = `${name}-error`;
  const cells = useMemo(() => monthCells(month), [month]);
  const minDate = min ? parseIso(min) : null;
  const maxDate = max ? parseIso(max) : null;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function selectDate(date: Date) {
    // Clamp to min/max
    if (minDate && date < minDate) return;
    if (maxDate && date > maxDate) return;
    onChange(toIso(date));
    setMonth(date);
    setOpen(false);
    setPickerMode("calendar");
  }

  function navigateYear(delta: number) {
    setMonth((current) => new Date(current.getFullYear() + delta, current.getMonth(), 1, 12));
  }

  const formatted = selected
    ? new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "short", year: "numeric" }).format(selected)
    : "Choose date";

  // Generate year range for year picker
  const currentYear = new Date().getFullYear();
  const selectedYear = month.getFullYear();
  const yearStart = Math.max(1900, selectedYear - 6);
  const yearEnd = Math.min(currentYear + 2, selectedYear + 6);
  const years = Array.from({ length: yearEnd - yearStart + 1 }, (_, i) => yearStart + i);

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <label className="text-xs font-medium" htmlFor={`${name}-button`}>{label}{required ? <span className="text-[color:var(--danger)]"> *</span> : null}</label>
      <input type="hidden" name={name} value={value} />
      <button
        id={`${name}-button`}
        type="button"
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onClick={() => {
          if (!open && selected) setMonth(selected);
          setPickerMode("calendar");
          setOpen((current) => !current);
        }}
        className={cn(
          "mt-1.5 flex min-h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border bg-surface-elevated px-3 text-left text-sm shadow-[var(--shadow-xs)] outline-none transition",
          error ? "border-[color:var(--danger)]/45" : "border-border-subtle hover:border-border focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]",
        )}
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>{formatted}</span>
        <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {error ? <p id={errorId} className="mt-1.5 text-xs text-[color:var(--danger)]">{error}</p> : null}

      {open ? (
        <div className="absolute left-0 top-full z-[90] mt-1.5 w-[min(19rem,calc(100vw-2rem))] rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-3 shadow-[var(--shadow-sm)]">
          {/* Header with month/year navigation */}
          <div className="flex items-center justify-between gap-2">
            {pickerMode === "calendar" ? (
              <>
                <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))} aria-label="Previous month" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                  <ChevronLeft className="size-4" />
                </button>
                <button type="button" onClick={() => setPickerMode("month")} className="text-sm font-semibold hover:text-brand-strong transition">
                  {new Intl.DateTimeFormat("en-NA", { month: "long" }).format(month)}
                </button>
                <button type="button" onClick={() => setPickerMode("year")} className="text-sm font-semibold hover:text-brand-strong transition">
                  {month.getFullYear()}
                </button>
                <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))} aria-label="Next month" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                  <ChevronRight className="size-4" />
                </button>
              </>
            ) : pickerMode === "year" ? (
              <>
                <button type="button" onClick={() => navigateYear(-12)} aria-label="Previous years" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-sm font-semibold">Select year</span>
                <button type="button" onClick={() => navigateYear(12)} aria-label="Next years" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                  <ChevronRight className="size-4" />
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setPickerMode("calendar")} aria-label="Back to calendar" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-sm font-semibold">Select month</span>
                <span className="size-8" />
              </>
            )}
          </div>

          {/* Year picker */}
          {pickerMode === "year" ? (
            <div className="mt-2 grid grid-cols-4 gap-1">
              {years.map((year) => {
                const active = year === month.getFullYear();
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      setMonth(new Date(year, month.getMonth(), 1, 12));
                      setPickerMode("month");
                    }}
                    className={cn(
                      "grid place-items-center rounded-[var(--radius-xs)] py-2 text-xs transition",
                      active ? "bg-brand font-semibold text-white" : "hover:bg-brand-soft hover:text-brand-strong",
                    )}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          ) : pickerMode === "month" ? (
            /* Month picker */
            <div className="mt-2 grid grid-cols-3 gap-1">
              {monthNames.map((name, index) => {
                const active = index === month.getMonth();
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setMonth(new Date(month.getFullYear(), index, 1, 12));
                      setPickerMode("calendar");
                    }}
                    className={cn(
                      "rounded-[var(--radius-xs)] py-2 text-xs transition",
                      active ? "bg-brand font-semibold text-white" : "hover:bg-brand-soft hover:text-brand-strong",
                    )}
                  >
                    {name.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Calendar grid */
            <>
              <div className="mt-2 grid grid-cols-7 text-center text-[0.65rem] font-medium text-muted-foreground">
                {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                  <span key={`${day}-${index}`} className="py-1">{day}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((date) => {
                  const iso = toIso(date);
                  const outside = date.getMonth() !== month.getMonth();
                  const active = iso === value;
                  const disabled = Boolean((minDate && date < minDate) || (maxDate && date > maxDate));
                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectDate(date)}
                      className={cn(
                        "grid aspect-square place-items-center rounded-[var(--radius-xs)] text-xs transition",
                        outside && "text-muted-foreground/45",
                        active ? "bg-brand font-semibold text-white" : "hover:bg-brand-soft hover:text-brand-strong",
                        disabled && "cursor-not-allowed opacity-30",
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2">
            <button type="button" onClick={() => { onChange(""); setOpen(false); setPickerMode("calendar"); }} className="min-h-8 rounded-[var(--radius-xs)] px-2 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface-muted">Clear</button>
            <button type="button" onClick={() => { const now = new Date(); selectDate(now); }} className="min-h-8 rounded-[var(--radius-xs)] px-2 text-[0.7rem] font-semibold text-brand-strong hover:bg-brand-soft">Today</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
