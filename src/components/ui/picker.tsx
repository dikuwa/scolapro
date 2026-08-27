"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerOption = { value: string; label: string; helper?: string };

export function Picker({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: PickerOption[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

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

  return (
    <div ref={rootRef} className={cn("relative flex min-w-0 flex-col gap-1.5", className)}>
      <label className="text-xs font-medium leading-4">{label}</label>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-left text-sm shadow-[var(--shadow-xs)] transition duration-[var(--motion-fast)] hover:border-border focus-visible:border-[color:var(--brand)]/45 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span className={cn("min-w-0 truncate", selected ? "text-foreground" : "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)]", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-64 overflow-auto rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-1.5 shadow-[var(--shadow-md)]">
          {options.length ? options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={cn("w-full rounded-[var(--radius-xs)] px-2.5 py-2 text-left transition hover:bg-surface-muted", option.value === value && "bg-brand-soft text-brand-strong")}
            >
              <span className="block truncate text-sm font-medium">{option.label}</span>
              {option.helper ? <span className="mt-0.5 block truncate text-[0.68rem] text-muted-foreground">{option.helper}</span> : null}
            </button>
          )) : <p className="px-2.5 py-3 text-xs text-muted-foreground">No options available yet.</p>}
        </div>
      ) : null}
    </div>
  );
}

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minutes = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

export function TimePicker({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (value: string) => void }) {
  const [hour = "", minute = ""] = value.split(":");
  return (
    <div className="min-w-0">
      <input type="hidden" name={name} value={value} />
      <p className="mb-1.5 text-xs font-medium leading-4">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <Picker label="Hour" name={`${name}-hour-ui`} value={hour} onChange={(next) => onChange(`${next}:${minute || "00"}`)} placeholder="Hour" options={hours.map((item) => ({ value: item, label: item }))} />
        <Picker label="Minute" name={`${name}-minute-ui`} value={minute} onChange={(next) => onChange(`${hour || "00"}:${next}`)} placeholder="Min" options={minutes.map((item) => ({ value: item, label: item }))} />
      </div>
    </div>
  );
}
