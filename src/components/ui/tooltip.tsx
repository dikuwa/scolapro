"use client";

import {
  cloneElement,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type TooltipSide = "top" | "right" | "bottom" | "left";

type TooltipTriggerProps = {
  "aria-describedby"?: string;
};

type TooltipPosition = {
  top: number;
  left: number;
  transform: string;
};

function getPosition(rect: DOMRect, side: TooltipSide): TooltipPosition {
  const gap = 9;
  if (side === "right") return { top: rect.top + rect.height / 2, left: rect.right + gap, transform: "translateY(-50%)" };
  if (side === "left") return { top: rect.top + rect.height / 2, left: rect.left - gap, transform: "translate(-100%, -50%)" };
  if (side === "bottom") return { top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: "translateX(-50%)" };
  return { top: rect.top - gap, left: rect.left + rect.width / 2, transform: "translate(-50%, -100%)" };
}

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
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  function clearPending() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function updatePosition() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPosition(getPosition(rect, side));
  }

  function scheduleOpen() {
    clearPending();
    timeoutRef.current = setTimeout(() => {
      updatePosition();
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

  const tooltipStyle: CSSProperties | undefined = position
    ? { top: position.top, left: position.left, transform: position.transform }
    : undefined;

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={scheduleOpen}
      onMouseLeave={closeImmediately}
      onFocusCapture={scheduleOpen}
      onBlurCapture={closeImmediately}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      {open && position && typeof document !== "undefined" ? createPortal(
        <span
          id={tooltipId}
          role="tooltip"
          style={tooltipStyle}
          className="pointer-events-none fixed z-[400] w-max max-w-64 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-left text-foreground shadow-[var(--shadow-sm)]"
        >
          <span className="block text-xs font-semibold leading-4">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-[0.7rem] leading-4 text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>,
        document.body,
      ) : null}
    </span>
  );
}
