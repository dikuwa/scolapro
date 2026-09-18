import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const formFieldLabelClass = "block h-4 text-xs font-medium leading-4";
export const formFieldControlOffsetClass = "mt-1.5";
// Mixed field rows (DateField, Pickers, raw inputs, FormActionSlot) must align rows to the
// START, never the end: DateField always carries a FormFieldFeedback reserve and Pickers do
// not, so bottom alignment drops every sibling control below the DateField control line.
export const formRowAlignClass = "items-start";

export function FormFieldFeedback({
  helper,
  error,
  errorId,
  className,
}: {
  helper?: ReactNode;
  error?: ReactNode;
  errorId?: string;
  className?: string;
}) {
  return (
    <div className={cn("mt-1 min-h-4 space-y-1", className)}>
      {helper ? <p className="text-[0.68rem] leading-4 text-muted-foreground">{helper}</p> : null}
      {error ? <p id={errorId} className="text-xs leading-4 text-[color:var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function FormActionSlot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("sm:min-w-max", className)}>
      <span aria-hidden="true" className="hidden h-4 sm:block" />
      <div className={formFieldControlOffsetClass}>{children}</div>
    </div>
  );
}
