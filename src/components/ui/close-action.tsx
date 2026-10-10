import { X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Canonical ScolaPro dismiss control for dialogs, previews and disclosure rows.
 *
 * Defaults to the light red-tinted `danger-soft` treatment: a quiet
 * `--danger-soft` surface with a low-opacity danger hover in both light and dark
 * themes. `variant="danger"` remains available where a close action genuinely
 * commits destruction, so this default never weakens destructive buttons
 * elsewhere.
 */
export function CloseAction({
  label = "Close",
  ariaLabel = "Close",
  variant = "danger-soft",
  className,
  ...props
}: Omit<ButtonProps, "children"> & {
  label?: string;
  ariaLabel?: string;
}) {
  return (
    <Button
      variant={variant}
      size="sm"
      aria-label={ariaLabel}
      className={cn("shrink-0", className)}
      {...props}
    >
      <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
      {label}
    </Button>
  );
}
