import { X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CloseAction({
  label = "Close",
  ariaLabel = "Close",
  variant = "soft",
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
