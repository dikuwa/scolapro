"use client";

import { useId, useRef, type InputHTMLAttributes } from "react";
import { Minus, Plus } from "lucide-react";
import { formFieldLabelClass, formFieldControlOffsetClass } from "@/components/ui/form-field-layout";
import { cn } from "@/lib/utils";

type NumberStepperProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  step?: number;
  min?: number;
  max?: number;
};

const hideSpinner =
  "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance]:textfield";

export function NumberStepper({
  className,
  label,
  step = 1,
  min,
  max,
  value,
  defaultValue,
  disabled,
  onChange,
  ...props
}: NumberStepperProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const stepId = useId();
  const inputId = props.id || stepId;

  const numericValue = (value ?? defaultValue ?? 0) as number;

  const clamp = (next: number) => {
    let result = next;
    if (typeof min === "number") result = Math.max(min, result);
    if (typeof max === "number") result = Math.min(max, result);
    return result;
  };

  const update = (next: number) => {
    const clamped = clamp(next);
    const input = inputRef.current;
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, String(clamped));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    onChange?.({
      ...new Event("input", { bubbles: true }),
      target: input,
      currentTarget: input,
    } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const decrement = () => update(numericValue - step);
  const increment = () => update(numericValue + step);

  const atMin = typeof min === "number" && numericValue <= min;
  const atMax = typeof max === "number" && numericValue >= max;

  return (
    <div className="min-w-0">
      {label ? (
        <label htmlFor={inputId} className={formFieldLabelClass}>
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          "scolapro-control-surface flex h-10 w-full items-stretch overflow-hidden rounded-[var(--radius-sm)]",
          label && formFieldControlOffsetClass,
          disabled && "cursor-not-allowed opacity-55",
          className,
        )}
      >
        <input
          {...props}
          id={inputId}
          ref={inputRef}
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          onChange={onChange}
          className={cn(
            "min-w-0 flex-1 border-0 bg-transparent px-3 py-0 h-full text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground/65 focus:outline-none focus:ring-0 focus-visible:outline-none",
            hideSpinner,
          )}
        />
        <span aria-hidden="true" className="w-px self-stretch bg-border-subtle" />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Decrease ${label ?? props["aria-label"] ?? props.name ?? "value"}`}
          aria-disabled={disabled || atMin}
          disabled={disabled || atMin}
          onClick={decrement}
          className={cn(
            "grid h-full w-10 shrink-0 place-items-center text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45",
            (disabled || atMin) && "pointer-events-none opacity-40",
          )}
        >
          <Minus className="size-3.5" aria-hidden="true" strokeWidth={2.4} />
        </button>
        <span aria-hidden="true" className="w-px self-stretch bg-border-subtle" />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Increase ${label ?? props["aria-label"] ?? props.name ?? "value"}`}
          aria-disabled={disabled || atMax}
          disabled={disabled || atMax}
          onClick={increment}
          className={cn(
            "grid h-full w-10 shrink-0 place-items-center text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45",
            (disabled || atMax) && "pointer-events-none opacity-40",
          )}
        >
          <Plus className="size-3.5" aria-hidden="true" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
