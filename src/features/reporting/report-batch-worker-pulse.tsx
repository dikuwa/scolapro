"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ReportBatchWorkerPulse({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: number | undefined;

    const pulse = async () => {
      try {
        await fetch("/api/report-card-batches/process", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("report-card batch worker pulse failed", error);
      }

      if (cancelled) return;
      router.refresh();
      timer = window.setTimeout(pulse, 2500);
    };

    void pulse();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active, router]);

  return null;
}
