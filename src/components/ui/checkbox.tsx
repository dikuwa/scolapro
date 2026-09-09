import { Check } from "lucide-react";

export function Checkbox({
  name,
  defaultChecked = false,
  label,
  className = "",
}: {
  name: string;
  defaultChecked?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-xs text-foreground ${className}`}>
      <span className="relative grid size-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          aria-label={label}
          className="peer size-5 cursor-pointer appearance-none rounded-[0.3rem] border border-border bg-surface-elevated shadow-[var(--shadow-xs)] outline-none transition hover:border-[color:var(--brand)]/60 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)] checked:border-[color:var(--brand)] checked:bg-brand"
        />
        <Check
          className="pointer-events-none absolute size-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100"
          strokeWidth={3}
          aria-hidden="true"
        />
      </span>
      <span>{label}</span>
    </label>
  );
}
