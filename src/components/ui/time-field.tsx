"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { FormFieldFeedback, formFieldControlOffsetClass, formFieldLabelClass } from "@/components/ui/form-field-layout";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
// Minutes keep full 1–59 granularity; the prior native input[type="time"] did not
// restrict to 5/15/30 steps, so this control must not introduce that restriction.
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function partsOf(value: string) {
  const match = value.match(TIME_RE);
  if (!match) return { hour: "", minute: "" };
  return { hour: match[1].padStart(2, "0"), minute: match[2] };
}

function toTyped(value: string) {
  const { hour, minute } = partsOf(value);
  if (!hour && !minute) return "";
  return `${hour || "00"}:${minute || "00"}`;
}

function TimePanel({
  hour,
  minute,
  onPick,
  onClear,
  onClose,
}: {
  hour: string;
  minute: string;
  onPick: (hour: string, minute: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hour) return;
    hourListRef.current?.querySelector<HTMLElement>(`[data-hour="${hour}"]`)?.scrollIntoView({ block: "center" });
  }, [hour]);

  useEffect(() => {
    if (!minute) return;
    minuteListRef.current?.querySelector<HTMLElement>(`[data-minute="${minute}"]`)?.scrollIntoView({ block: "center" });
  }, [minute]);

  return (
    <div className="absolute right-0 top-full z-[80] mt-1 w-[16rem] max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-3 shadow-[var(--shadow-md)]" role="dialog" aria-label="Choose time">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Hour</p>
          <div ref={hourListRef} role="listbox" aria-label="Hour" className="max-h-48 overflow-y-auto scolapro-scrollbar rounded-[var(--radius-sm)] bg-surface-muted/55 p-1">
            {HOURS.map((item) => (
              <button
                key={item}
                type="button"
                data-hour={item}
                role="option"
                aria-selected={item === hour}
                onClick={() => onPick(item, minute || "00")}
                className={cn(
                  "block w-full rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-xs transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45",
                  item === hour && "bg-brand font-semibold text-white hover:bg-brand",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">Minute</p>
          <div ref={minuteListRef} role="listbox" aria-label="Minute" className="max-h-48 overflow-y-auto scolapro-scrollbar rounded-[var(--radius-sm)] bg-surface-muted/55 p-1">
            {MINUTES.map((item) => (
              <button
                key={item}
                type="button"
                data-minute={item}
                role="option"
                aria-selected={item === minute}
                onClick={() => onPick(hour || "00", item)}
                className={cn(
                  "block w-full rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-xs transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45",
                  item === minute && "bg-brand font-semibold text-white hover:bg-brand",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2">
        <button type="button" onClick={onClear} className="rounded-[var(--radius-xs)] px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-surface-muted hover:text-foreground">
          Clear
        </button>
        <button type="button" onClick={onClose} className="rounded-[var(--radius-xs)] px-2 py-1.5 text-xs font-medium text-brand-strong transition hover:bg-brand-soft">
          Done
        </button>
      </div>
    </div>
  );
}

export function TimeField({
  label,
  name,
  value,
  onChange,
  required = false,
  error,
  className,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleValue = draft ?? toTyped(value);
  const errorId = `${name}-error`;
  const visibleError = error ?? localError;
  const { hour: selectedHour, minute: selectedMinute } = partsOf(value);

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

  function commitTyped(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange("");
      setDraft(null);
      setLocalError(null);
      return;
    }
    if (!TIME_RE.test(trimmed)) {
      setLocalError("Use HH:MM, for example 14:30.");
      return;
    }
    const { hour, minute } = partsOf(trimmed);
    onChange(`${hour}:${minute}`);
    setDraft(null);
    setLocalError(null);
  }

  function pick(hour: string, minute: string) {
    onChange(`${hour}:${minute}`);
    setDraft(null);
    setLocalError(null);
  }

  function clear() {
    onChange("");
    setDraft(null);
    setLocalError(null);
  }

  return (
    <div ref={rootRef} className={cn("min-w-0", className)}>
      <label className={formFieldLabelClass} htmlFor={`${name}-typed`}>
        {label}
        {required ? <span className="text-[color:var(--danger)]"> *</span> : null}
      </label>
      <input type="hidden" name={name} value={value} />
      <div className={cn("relative", formFieldControlOffsetClass)}>
        {/* The bordered wrapper owns the 40px control height and centers its content.
            Mirrors DateField so labelled TimeField stays level with Picker/DateField rows. */}
        <div
          className={cn(
            "scolapro-control-surface flex min-h-10 w-full items-center overflow-hidden rounded-[var(--radius-sm)]",
            visibleError
              ? "border-[color:var(--danger)]/45 focus-within:border-[color:var(--danger)]/55 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_10%,transparent),var(--shadow-sm)]"
              : "hover:border-border",
          )}
        >
          <input
            id={`${name}-typed`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={visibleValue}
            onChange={(event) => {
              setDraft(event.target.value);
              setLocalError(null);
            }}
            onBlur={() => commitTyped(visibleValue)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitTyped(visibleValue);
              }
            }}
            placeholder="HH:MM"
            aria-invalid={Boolean(visibleError)}
            aria-describedby={visibleError ? errorId : undefined}
            className="min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground/65 focus:outline-none focus:ring-0 focus-visible:outline-none"
          />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpen((current) => !current)}
            aria-label={`Open ${label.toLowerCase()} time`}
            aria-expanded={open}
            className={cn(
              "mr-1 grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45",
              open && "bg-brand-soft text-brand-strong",
            )}
          >
            <Clock3 aria-hidden="true" className="size-4" />
          </button>
        </div>
        {open ? (
          <TimePanel hour={selectedHour} minute={selectedMinute} onPick={pick} onClear={clear} onClose={() => setOpen(false)} />
        ) : null}
      </div>
      <FormFieldFeedback error={visibleError} errorId={errorId} />
    </div>
  );
}
