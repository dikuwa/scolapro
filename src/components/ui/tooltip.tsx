"use client";

import {
  cloneElement,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

type TooltipSide = "top" | "right" | "bottom" | "left";

type TooltipTriggerProps = {
  "aria-describedby"?: string;
};

const positionClasses: Record<TooltipSide, string> = {
  top: "bottom-[calc(100%+0.55rem)] left-1/2 -translate-x-1/2",
  right: "left-[calc(100%+0.55rem)] top-1/2 -translate-y-1/2",
  bottom: "left-1/2 top-[calc(100%+0.55rem)] -translate-x-1/2",
  left: "right-[calc(100%+0.55rem)] top-1/2 -translate-y-1/2",
};

export function Tooltip({
  children,
  title,
  description,
  side = "top",
  delay = 500,
}: {
  children: ReactElement<TooltipTriggerProps>;
  title: string;
  description?: ReactNode;
  side?: TooltipSide;
  delay?: number;
}) {
  const tooltipId = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);

  function clearPending() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function scheduleOpen() {
    clearPending();
    timeoutRef.current = setTimeout(() => {
      setOpen(true);
      timeoutRef.current = null;
    }, delay);
  }

  function closeImmediately() {
    clearPending();
    setOpen(false);
  }

  const existingDescription = children.props["aria-describedby"];
  const describedBy = [existingDescription, open ? tooltipId : undefined]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={scheduleOpen}
      onMouseLeave={closeImmediately}
      onFocusCapture={scheduleOpen}
      onBlurCapture={closeImmediately}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute z-[220] w-max max-w-64 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-left text-foreground shadow-[var(--shadow-sm)] ${positionClasses[side]}`}
        >
          <span className="block text-xs font-semibold leading-4">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-[0.7rem] leading-4 text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
