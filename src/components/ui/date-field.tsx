"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Picker } from "@/components/ui/picker";
import { cn } from "@/lib/utils";

function parseIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
}

function parseDisplay(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
  return date.getFullYear() === Number(match[3]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[1]) ? date : null;
}

function toIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toDisplay(date: Date | null) {
  return date ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}` : "";
}

function formatTypedDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");
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

const monthNames = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat("en-NA", { month: "long" }).format(new Date(2020, month, 1)));

export function DateField({ label, name, value, onChange, required = false, error, min, max, className }: { label: string; name: string; value: string; onChange: (value: string) => void; required?: boolean; error?: string; min?: string; max?: string; className?: string }) {
  const selected = parseIso(value);
  const [typedValue, setTypedValue] = useState(() => toDisplay(selected));
  const [localError, setLocalError] = useState("");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => selected ?? parseIso(max ?? "") ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const cells = useMemo(() => monthCells(month), [month]);
  const minDate = min ? parseIso(min) : null;
  const maxDate = max ? parseIso(max) : null;
  const effectiveError = error || localError;
  const currentYear = new Date().getFullYear();
  const firstYear = minDate?.getFullYear() ?? currentYear - 120;
  const lastYear = maxDate?.getFullYear() ?? currentYear + 10;
  const yearOptions = useMemo(() => Array.from({ length: Math.max(0, lastYear - firstYear + 1) }, (_, index) => lastYear - index).map((year) => ({ value: String(year), label: String(year) })), [firstYear, lastYear]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  function isOutsideRange(date: Date) {
    return Boolean((minDate && date < minDate) || (maxDate && date > maxDate));
  }

  function selectDate(date: Date) {
    if (isOutsideRange(date)) return;
    onChange(toIso(date));
    setTypedValue(toDisplay(date));
    setLocalError("");
    setMonth(date);
    setOpen(false);
  }

  function commitTypedValue() {
    if (!typedValue) {
      onChange("");
      setLocalError(required ? "Enter a date in DD/MM/YYYY format." : "");
      return;
    }
    const date = parseDisplay(typedValue);
    if (!date) { setLocalError("Enter a valid date in DD/MM/YYYY format."); return; }
    if (isOutsideRange(date)) { setLocalError(`Choose a date${min ? ` on or after ${toDisplay(minDate)}` : ""}${max ? ` on or before ${toDisplay(maxDate)}` : ""}.`); return; }
    onChange(toIso(date));
    setMonth(date);
    setLocalError("");
  }

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <label className="text-xs font-medium" htmlFor={`${name}-text`}>{label}{required ? <span className="text-[color:var(--danger)]"> *</span> : null}</label>
      <input type="hidden" name={name} value={value} />
      <div className={cn("mt-1.5 flex min-h-10 items-center rounded-[var(--radius-sm)] border bg-surface-elevated shadow-[var(--shadow-xs)] transition duration-[var(--motion-fast)] focus-within:ring-4", effectiveError ? "border-[color:var(--danger)]/45 focus-within:ring-danger-soft" : "border-border-subtle hover:border-border focus-within:border-[color:var(--brand)]/45 focus-within:ring-[color:var(--brand-soft)]")}>
        <input id={`${name}-text`} type="text" inputMode="numeric" autoComplete="off" placeholder="DD/MM/YYYY" value={typedValue} aria-invalid={Boolean(effectiveError)} aria-describedby={effectiveError ? errorId : hintId} onChange={(event) => { setTypedValue(formatTypedDate(event.target.value)); setLocalError(""); }} onBlur={commitTypedValue} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTypedValue(); } }} className="min-h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/65" />
        <button type="button" aria-label={`Open ${label.toLowerCase()} calendar`} aria-expanded={open} onClick={() => { if (!open && selected) setMonth(selected); setOpen((current) => !current); }} className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition duration-[var(--motion-fast)] hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/35"><CalendarDays aria-hidden="true" className="size-4" /></button>
      </div>
      {effectiveError ? <p id={errorId} className="mt-1.5 text-xs text-[color:var(--danger)]">{effectiveError}</p> : <p id={hintId} className="mt-1 text-[0.68rem] text-muted-foreground">Type as DD/MM/YYYY or choose from the calendar.</p>}

      {open ? <div className="absolute left-0 top-full z-[90] mt-1.5 w-[min(20rem,calc(100vw-2rem))] rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-3 shadow-[var(--shadow-sm)]">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(5rem,0.7fr)_auto] items-end gap-2">
          <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))} aria-label="Previous month" className="grid size-10 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
          <Picker ariaLabel="Calendar month" name={`${name}-month-ui`} value={String(month.getMonth())} onChange={(next) => setMonth((current) => new Date(current.getFullYear(), Number(next), 1, 12))} placeholder="Month" options={monthNames.map((item, index) => ({ value: String(index), label: item }))} />
          <Picker ariaLabel="Calendar year" name={`${name}-year-ui`} value={String(month.getFullYear())} onChange={(next) => setMonth((current) => new Date(Number(next), current.getMonth(), 1, 12))} placeholder="Year" options={yearOptions} />
          <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))} aria-label="Next month" className="grid size-10 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><ChevronRight className="size-4" /></button>
        </div>
        <div className="mt-2 grid grid-cols-7 text-center text-[0.65rem] font-medium text-muted-foreground">{["M","T","W","T","F","S","S"].map((day, index) => <span key={`${day}-${index}`} className="py-1">{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-0.5">{cells.map((date) => { const iso = toIso(date); const outside = date.getMonth() !== month.getMonth(); const active = iso === value; const disabled = isOutsideRange(date); return <button key={iso} type="button" disabled={disabled} onClick={() => selectDate(date)} className={cn("grid aspect-square place-items-center rounded-[var(--radius-xs)] text-xs transition duration-[var(--motion-fast)]", outside && "text-muted-foreground/45", active ? "bg-brand font-semibold text-white" : "hover:bg-brand-soft hover:text-brand-strong", disabled && "cursor-not-allowed opacity-30")}>{date.getDate()}</button>; })}</div>
        <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2"><button type="button" onClick={() => { onChange(""); setTypedValue(""); setLocalError(""); setOpen(false); }} className="min-h-8 rounded-[var(--radius-xs)] px-2 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface-muted">Clear</button><button type="button" disabled={isOutsideRange(new Date())} onClick={() => selectDate(new Date())} className="min-h-8 rounded-[var(--radius-xs)] px-2 text-[0.7rem] font-semibold text-brand-strong hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40">Today</button></div>
      </div> : null}
    </div>
  );
}
