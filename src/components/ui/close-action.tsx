import { X } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CloseAction({
  label = "Close",
  ariaLabel = "Close",
  className,
  ...props
}: Omit<ButtonProps, "children" | "variant"> & {
  label?: string;
  ariaLabel?: string;
}) {
  return (
    <Button
      variant="soft"
      size="sm"
      aria-label={ariaLabel}
      className={cn("shrink-0 text-brand-strong", className)}
      {...props}
    >
      <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
      {label}
    </Button>
  );
}
