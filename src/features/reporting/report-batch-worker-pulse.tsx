"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const SUCCESS_DELAY_MS = 2_500;
const MAX_FAILURE_DELAY_MS = 30_000;

function failureDelay(attempt: number) {
  return Math.min(SUCCESS_DELAY_MS * 2 ** Math.max(0, attempt - 1), MAX_FAILURE_DELAY_MS);
}

export function ReportBatchWorkerPulse({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: number | undefined;
    let failureCount = 0;

    const schedule = (delay: number) => {
      if (cancelled) return;
      timer = window.setTimeout(pulse, delay);
    };

    const pulse = async () => {
      try {
        const response = await fetch("/api/report-card-batches/process", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
        });

        if (cancelled) return;

        if (response.status === 401 || response.status === 403) {
          // The session or role changed while this page was open. Stop instead of
          // repeatedly invoking a worker endpoint the user can no longer access.
          return;
        }

        if (!response.ok) {
          failureCount += 1;
          schedule(failureDelay(failureCount));
          return;
        }

        failureCount = 0;
        router.refresh();
        schedule(SUCCESS_DELAY_MS);
      } catch (error) {
        if (cancelled) return;
        failureCount += 1;
        console.error("report-card batch worker pulse failed", error);
        schedule(failureDelay(failureCount));
      }
    };

    void pulse();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active, router]);

  return null;
}
