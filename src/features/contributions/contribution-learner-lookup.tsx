"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { searchContributionLearners, type ContributionLearnerOption } from "@/features/contributions/server/learner-search-actions";

export function ContributionLearnerLookup({
  academicYear,
  value,
  onChange,
}: {
  academicYear: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ContributionLearnerOption[]>([]);
  const [selected, setSelected] = useState<ContributionLearnerOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await searchContributionLearners(academicYear, query);
        if (requestId === requestRef.current) setOptions(results);
      } catch {
        if (requestId === requestRef.current) {
          setOptions([]);
          setError("Learners could not be loaded. Try again.");
        }
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [academicYear, open, query]);

  function choose(option: ContributionLearnerOption) {
    setSelected(option);
    onChange(option.id);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    setSelected(null);
    onChange("");
    setQuery("");
    setOptions([]);
  }

  const selectedLabel = selected ? `${selected.name} · ${selected.admissionNumber ?? "No number"}` : "Choose learner";

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-col gap-1.5">
      <label className="text-xs font-medium leading-4" htmlFor={`${listboxId}-search`}>Learner</label>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        className="scolapro-control-surface flex min-h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 text-left text-sm outline-none transition duration-[var(--motion-fast)] hover:border-border focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]"
      >
        <span className={cn("min-w-0 truncate", selected ? "text-foreground" : "text-muted-foreground")}>{selectedLabel}</span>
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-[90] mt-1 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-1.5 shadow-[var(--shadow-md)]">
          <label className="scolapro-control-surface flex min-h-9 items-center gap-2 rounded-[var(--radius-xs)] px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id={`${listboxId}-search`}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (event.key === "Enter" && options.length === 1) {
                  event.preventDefault();
                  choose(options[0]);
                }
              }}
              placeholder="Search name, admission no., grade or class…"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
            />
            {loading ? <Spinner className="size-3.5 text-muted-foreground" /> : null}
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear learner search" className="grid size-6 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted">
                <X className="size-3" />
              </button>
            ) : null}
          </label>

          <div id={listboxId} role="listbox" aria-label="Eligible learners" className="mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-xs)]">
            {error ? <p className="px-3 py-4 text-center text-xs text-[color:var(--danger)]">{error}</p> : null}
            {!error && !loading && options.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">{query.trim() ? "No eligible learner matches this search." : "No eligible learners found."}</p>
            ) : null}
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                onClick={() => choose(option)}
                className={cn("flex min-h-12 w-full items-center gap-2 rounded-[var(--radius-xs)] px-2.5 text-left transition hover:bg-surface-muted", option.id === value && "bg-surface-muted text-brand-strong")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{option.name}</span>
                  <span className="block truncate text-[0.64rem] text-muted-foreground">{option.admissionNumber ?? "No number"} · {option.grade} · {option.registerClass}</span>
                </span>
                {option.id === value ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selected ? (
        <button type="button" onClick={clear} className="mt-0.5 self-start text-[0.68rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Clear learner
        </button>
      ) : null}
    </div>
  );
}