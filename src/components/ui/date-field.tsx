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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTyped(value: string) {
  const date = parseIso(value);
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

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekdayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function clampMonth(date: Date, min?: string, max?: string) {
  const minDate = min ? parseIso(min) : null;
  const maxDate = max ? parseIso(max) : null;
  if (minDate && date < new Date(minDate.getFullYear(), minDate.getMonth(), 1, 12)) return new Date(minDate.getFullYear(), minDate.getMonth(), 1, 12);
  if (maxDate && date > new Date(maxDate.getFullYear(), maxDate.getMonth(), 1, 12)) return new Date(maxDate.getFullYear(), maxDate.getMonth(), 1, 12);
  return date;
}

function CalendarPanel({ value, min, max, onSelect, onClose }: { value: string; min?: string; max?: string; onSelect: (value: string) => void; onClose: () => void }) {
  const selected = parseIso(value);
  const today = new Date();
  const initial = selected ?? clampMonth(new Date(today.getFullYear(), today.getMonth(), 1, 12), min, max);
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1, 12));
  const [yearMode, setYearMode] = useState(false);
  const minYear = min ? parseIso(min)?.getFullYear() ?? 1900 : 1900;
  const maxYear = max ? parseIso(max)?.getFullYear() ?? today.getFullYear() + 20 : today.getFullYear() + 20;
  const years = useMemo(() => Array.from({ length: Math.max(0, maxYear - minYear + 1) }, (_, index) => maxYear - index), [minYear, maxYear]);
  const yearListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!yearMode) return;
    const current = yearListRef.current?.querySelector<HTMLElement>(`[data-year="${view.getFullYear()}"]`);
    current?.scrollIntoView({ block: "center" });
  }, [yearMode, view]);

  const firstDay = new Date(view.getFullYear(), view.getMonth(), 1, 12);
  const offset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(view.getFullYear(), view.getMonth(), 1 - offset, 12);
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index, 12));

  function inRange(date: Date) {
    const iso = toIso(date);
    return (!min || iso >= min) && (!max || iso <= max);
  }

  function moveMonth(delta: number) {
    setView((current) => clampMonth(new Date(current.getFullYear(), current.getMonth() + delta, 1, 12), min, max));
  }

  return (
    <div className="absolute right-0 top-full z-[80] mt-1 w-[19rem] max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-3 shadow-[var(--shadow-md)]" role="dialog" aria-label="Choose date">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => moveMonth(-1)} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground" aria-label="Previous month"><ChevronLeft className="size-4" /></button>
        <button type="button" onClick={() => setYearMode((current) => !current)} className="rounded-[var(--radius-xs)] px-2 py-1.5 text-sm font-semibold text-foreground transition hover:bg-surface-muted" aria-expanded={yearMode}>{monthNames[view.getMonth()]} {view.getFullYear()}</button>
        <button type="button" onClick={() => moveMonth(1)} className="grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground" aria-label="Next month"><ChevronRight className="size-4" /></button>
      </div>

      {yearMode ? (
        <div ref={yearListRef} className="mt-2 grid max-h-56 grid-cols-3 gap-1 overflow-y-auto rounded-[var(--radius-sm)] bg-surface-muted/55 p-1.5">
          {years.map((year) => <button key={year} data-year={year} type="button" onClick={() => { setView((current) => new Date(year, current.getMonth(), 1, 12)); setYearMode(false); }} className={cn("rounded-[var(--radius-xs)] px-2 py-2 text-xs font-medium transition hover:bg-surface-elevated", year === view.getFullYear() && "bg-brand-soft text-brand-strong")}>{year}</button>)}
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-7 gap-1" aria-hidden="true">{weekdayLabels.map((label) => <span key={label} className="grid h-7 place-items-center text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">{days.map((date) => {
            const iso = toIso(date);
            const outsideMonth = date.getMonth() !== view.getMonth();
            const disabled = !inRange(date);
            const isSelected = iso === value;
            const isToday = iso === toIso(today);
            return <button key={iso} type="button" disabled={disabled} onClick={() => { onSelect(iso); onClose(); }} className={cn("grid size-9 place-items-center rounded-[var(--radius-xs)] text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", outsideMonth && "text-muted-foreground/45", !disabled && "hover:bg-surface-muted hover:text-foreground", isToday && !isSelected && "font-semibold text-brand-strong ring-1 ring-inset ring-brand/30", isSelected && "bg-brand font-semibold text-white shadow-[var(--shadow-xs)] hover:bg-brand", disabled && "cursor-not-allowed opacity-25")}>{date.getDate()}</button>;
          })}</div>
        </>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2">
        <button type="button" onClick={() => { const todayIso = toIso(today); if (inRange(today)) { onSelect(todayIso); onClose(); } }} disabled={!inRange(today)} className="rounded-[var(--radius-xs)] px-2 py-1.5 text-xs font-medium text-brand-strong transition hover:bg-brand-soft disabled:opacity-40">Today</button>
        <button type="button" onClick={onClose} className="rounded-[var(--radius-xs)] px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-surface-muted hover:text-foreground">Close</button>
      </div>
    </div>
  );
}

export function DateField({ label, name, value, onChange, required = false, error, min, max, className }: { label: string; name: string; value: string; onChange: (value: string) => void; required?: boolean; error?: string; min?: string; max?: string; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleValue = draft ?? toTyped(value);
  const errorId = `${name}-error`;
  const visibleError = error ?? localError;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  function commitTyped(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) { onChange(""); setDraft(null); setLocalError(null); return; }
    const date = parseTyped(trimmed);
    if (!date) { setLocalError("Use DD/MM/YYYY, for example 14/05/2010."); return; }
    const iso = toIso(date);
    if ((min && iso < min) || (max && iso > max)) { setLocalError("This date is outside the allowed range."); return; }
    onChange(iso); setDraft(null); setLocalError(null);
  }

  return (
    <div ref={rootRef} className={cn("min-w-0", className)}>
      <label className="text-xs font-medium" htmlFor={`${name}-typed`}>{label}{required ? <span className="text-[color:var(--danger)]"> *</span> : null}</label>
      <input type="hidden" name={name} value={value} />
      <div className="relative mt-1.5">
        <div className={cn("scolapro-control-surface flex min-h-10 w-full items-center overflow-hidden rounded-[var(--radius-sm)]", visibleError ? "border-[color:var(--danger)]/45 focus-within:border-[color:var(--danger)]/55 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_10%,transparent),var(--shadow-sm)]" : "hover:border-border")}>
          <input id={`${name}-typed`} type="text" inputMode="numeric" autoComplete="off" value={visibleValue} onChange={(event) => { setDraft(event.target.value); setLocalError(null); }} onBlur={() => commitTyped(visibleValue)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTyped(visibleValue); } }} placeholder="DD/MM/YYYY" aria-invalid={Boolean(visibleError)} aria-describedby={visibleError ? errorId : undefined} className="min-h-10 min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground/65 focus:outline-none focus:ring-0 focus-visible:outline-none" />
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((current) => !current)} aria-label={`Open ${label.toLowerCase()} calendar`} aria-expanded={open} className={cn("mr-1 grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45", open && "bg-brand-soft text-brand-strong")}><CalendarDays aria-hidden="true" className="size-4" /></button>
        </div>
        {open ? <CalendarPanel value={value} min={min} max={max} onSelect={(next) => { onChange(next); setDraft(null); setLocalError(null); }} onClose={() => setOpen(false)} /> : null}
      </div>
      <p className="mt-1 text-[0.65rem] text-muted-foreground">Type DD/MM/YYYY or use the calendar button.</p>
      {visibleError ? <p id={errorId} className="mt-1 text-xs text-[color:var(--danger)]">{visibleError}</p> : null}
    </div>
  );
}
