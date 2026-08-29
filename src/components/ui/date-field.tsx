"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function parseIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function toIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTyped(date: Date | null) {
  if (!date) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function parseTyped(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return parseIso(trimmed);
  const match = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
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
  const [typedValue, setTypedValue] = useState(() => toTyped(selected));
  const [typedError, setTypedError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const errorId = `${name}-error`;
  const cells = useMemo(() => monthCells(month), [month]);
  const minDate = min ? parseIso(min) : null;
  const maxDate = max ? parseIso(max) : null;

  useEffect(() => {
    setTypedValue(toTyped(parseIso(value)));
    setTypedError(null);
  }, [value]);

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

  function dateAllowed(date: Date) {
    if (minDate && date < minDate) return false;
    if (maxDate && date > maxDate) return false;
    return true;
  }

  function selectDate(date: Date) {
    if (!dateAllowed(date)) return;
    onChange(toIso(date));
    setTypedValue(toTyped(date));
    setTypedError(null);
    setMonth(date);
    setOpen(false);
    setPickerMode("calendar");
  }

  function commitTyped() {
    const raw = typedValue.trim();
    if (!raw) {
      onChange("");
      setTypedError(null);
      return;
    }
    const date = parseTyped(raw);
    if (!date) {
      setTypedError("Use DD/MM/YYYY, for example 14/05/2010.");
      return;
    }
    if (!dateAllowed(date)) {
      setTypedError("This date is outside the allowed range.");
      return;
    }
    onChange(toIso(date));
    setTypedValue(toTyped(date));
    setMonth(date);
    setTypedError(null);
  }

  function navigateYear(delta: number) {
    setMonth((current) => new Date(current.getFullYear() + delta, current.getMonth(), 1, 12));
  }

  const currentYear = new Date().getFullYear();
  const selectedYear = month.getFullYear();
  const yearStart = Math.max(1900, selectedYear - 6);
  const upperBound = maxDate?.getFullYear() ?? currentYear + 2;
  const yearEnd = Math.min(upperBound, selectedYear + 6);
  const years = Array.from({ length: Math.max(0, yearEnd - yearStart + 1) }, (_, i) => yearStart + i);
  const visibleError = error ?? typedError;

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <label className="text-xs font-medium" htmlFor={`${name}-typed`}>{label}{required ? <span className="text-[color:var(--danger)]"> *</span> : null}</label>
      <input type="hidden" name={name} value={value} />
      <div className={cn(
        "mt-1.5 flex min-h-10 w-full items-center rounded-[var(--radius-sm)] border bg-surface-elevated shadow-[var(--shadow-xs)] transition focus-within:ring-4",
        visibleError ? "border-[color:var(--danger)]/45 focus-within:ring-[color:var(--danger)]/10" : "border-border-subtle hover:border-border focus-within:border-[color:var(--brand)]/45 focus-within:ring-[color:var(--brand-soft)]",
      )}>
        <input
          id={`${name}-typed`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={typedValue}
          onChange={(event) => { setTypedValue(event.target.value); setTypedError(null); }}
          onBlur={commitTyped}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTyped(); } }}
          placeholder="DD/MM/YYYY"
          aria-invalid={Boolean(visibleError)}
          aria-describedby={visibleError ? errorId : undefined}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/65"
        />
        <button
          type="button"
          aria-label={`Open ${label.toLowerCase()} calendar`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (!open && selected) setMonth(selected);
            setPickerMode("calendar");
            setOpen((current) => !current);
          }}
          className="mr-1 grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
        >
          <CalendarDays aria-hidden="true" className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-[0.65rem] text-muted-foreground">Type DD/MM/YYYY or use the calendar.</p>
      {visibleError ? <p id={errorId} className="mt-1 text-xs text-[color:var(--danger)]">{visibleError}</p> : null}

      {open ? (
        <div className="absolute left-0 top-full z-[190] mt-1.5 w-[min(19rem,calc(100vw-2rem))] rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-3 shadow-[var(--shadow-md)]">
          <div className="flex items-center justify-between gap-2">
            {pickerMode === "calendar" ? (
              <>
                <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))} aria-label="Previous month" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
                <button type="button" onClick={() => setPickerMode("month")} className="text-sm font-semibold transition hover:text-brand-strong">{new Intl.DateTimeFormat("en-NA", { month: "long" }).format(month)}</button>
                <button type="button" onClick={() => setPickerMode("year")} className="text-sm font-semibold transition hover:text-brand-strong">{month.getFullYear()}</button>
                <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))} aria-label="Next month" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><ChevronRight className="size-4" /></button>
              </>
            ) : pickerMode === "year" ? (
              <>
                <button type="button" onClick={() => navigateYear(-12)} aria-label="Previous years" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
                <span className="text-sm font-semibold">Select year</span>
                <button type="button" onClick={() => navigateYear(12)} aria-label="Next years" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><ChevronRight className="size-4" /></button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setPickerMode("calendar")} aria-label="Back to calendar" className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
                <span className="text-sm font-semibold">Select month</span><span className="size-8" />
              </>
            )}
          </div>

          {pickerMode === "year" ? (
            <div className="mt-2 grid grid-cols-4 gap-1">
              {years.map((year) => <button key={year} type="button" onClick={() => { setMonth(new Date(year, month.getMonth(), 1, 12)); setPickerMode("month"); }} className={cn("grid place-items-center rounded-[var(--radius-xs)] py-2 text-xs transition", year === month.getFullYear() ? "bg-brand font-semibold text-white" : "hover:bg-brand-soft hover:text-brand-strong")}>{year}</button>)}
            </div>
          ) : pickerMode === "month" ? (
            <div className="mt-2 grid grid-cols-3 gap-1">
              {monthNames.map((monthName, index) => <button key={monthName} type="button" onClick={() => { setMonth(new Date(month.getFullYear(), index, 1, 12)); setPickerMode("calendar"); }} className={cn("rounded-[var(--radius-xs)] py-2 text-xs transition", index === month.getMonth() ? "bg-brand font-semibold text-white" : "hover:bg-brand-soft hover:text-brand-strong")}>{monthName.slice(0, 3)}</button>)}
            </div>
          ) : (
            <>
              <div className="mt-2 grid grid-cols-7 text-center text-[0.65rem] font-medium text-muted-foreground">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`} className="py-1">{day}</span>)}</div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((date) => {
                  const iso = toIso(date);
                  const outside = date.getMonth() !== month.getMonth();
                  const active = iso === value;
                  const disabled = !dateAllowed(date);
                  return <button key={iso} type="button" disabled={disabled} onClick={() => selectDate(date)} className={cn("grid aspect-square place-items-center rounded-[var(--radius-xs)] text-xs transition", outside && "text-muted-foreground/45", active ? "bg-brand font-semibold text-white" : "hover:bg-brand-soft hover:text-brand-strong", disabled && "cursor-not-allowed opacity-30")}>{date.getDate()}</button>;
                })}
              </div>
            </>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2">
            <button type="button" onClick={() => { onChange(""); setTypedValue(""); setTypedError(null); setOpen(false); setPickerMode("calendar"); }} className="min-h-8 rounded-[var(--radius-xs)] px-2 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface-muted">Clear</button>
            <button type="button" onClick={() => selectDate(new Date())} className="min-h-8 rounded-[var(--radius-xs)] px-2 text-[0.7rem] font-semibold text-brand-strong hover:bg-brand-soft">Today</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
