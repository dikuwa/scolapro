"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
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
  const nativeRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const visibleValue = draft ?? toTyped(value);
  const errorId = `${name}-error`;
  const visibleError = error ?? localError;

  function commitTyped(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange("");
      setDraft(null);
      setLocalError(null);
      return;
    }
    const date = parseTyped(trimmed);
    if (!date) {
      setLocalError("Use DD/MM/YYYY, for example 14/05/2010.");
      return;
    }
    const iso = toIso(date);
    if ((min && iso < min) || (max && iso > max)) {
      setLocalError("This date is outside the allowed range.");
      return;
    }
    onChange(iso);
    setDraft(null);
    setLocalError(null);
  }

  function openNativePicker() {
    const input = nativeRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  }

  return (
    <div className={cn("relative min-w-0", className)}>
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
          value={visibleValue}
          onChange={(event) => { setDraft(event.target.value); setLocalError(null); }}
          onBlur={() => commitTyped(visibleValue)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTyped(visibleValue); } }}
          placeholder="DD/MM/YYYY"
          aria-invalid={Boolean(visibleError)}
          aria-describedby={visibleError ? errorId : undefined}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/65"
        />
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={openNativePicker} aria-label={`Open ${label.toLowerCase()} calendar`} className="mr-1 grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"><CalendarDays aria-hidden="true" className="size-4" /></button>
        <input ref={nativeRef} type="date" value={value} min={min} max={max} tabIndex={-1} aria-hidden="true" onChange={(event) => { onChange(event.target.value); setDraft(null); setLocalError(null); }} className="pointer-events-none absolute size-px opacity-0" />
      </div>
      <p className="mt-1 text-[0.65rem] text-muted-foreground">Type DD/MM/YYYY or use the calendar button.</p>
      {visibleError ? <p id={errorId} className="mt-1 text-xs text-[color:var(--danger)]">{visibleError}</p> : null}
    </div>
  );
}
