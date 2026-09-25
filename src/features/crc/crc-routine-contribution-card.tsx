"use client";

import { useActionState, useEffect, useState } from "react";
import { BookOpenCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import {
  appendRoutineCrcContribution,
  type CrcContributionActionState,
} from "@/features/crc/server/contributions";
import type { CrcContributionContext } from "@/features/crc/server/custody";

const initialState: CrcContributionActionState = {};

const domainOptions = [
  { value: "overall_impression", label: "Overall impression" },
  { value: "social", label: "Social development" },
  { value: "psychological", label: "Psychological development" },
];

export function CrcRoutineContributionCard({
  context,
}: {
  context: CrcContributionContext;
}) {
  const [domain, setDomain] = useState("overall_impression");
  const [state, action, pending] = useActionState(appendRoutineCrcContribution, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state.message, state.success]);

  return (
    <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
          <BookOpenCheck className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="scolapro-section-title">Register-teacher CRC contribution</h2>
          <p className="scolapro-section-description">
            Add a routine observation for {context.registerClassLabel} · {context.gradeLabel}. This form cannot write health, psychometric, counselling or highly restricted records.
          </p>
        </div>
      </div>

      <form action={action} className="mt-4 grid gap-4">
        <input type="hidden" name="enrolmentId" value={context.enrolmentId} />
        <input type="hidden" name="learnerId" value={context.learnerId} />
        <Picker
          label="CRC area"
          name="domain"
          value={domain}
          onChange={setDomain}
          options={domainOptions}
          placeholder="Choose an area"
        />
        <label className="grid gap-1.5">
          <span className="text-xs font-medium">Routine observation</span>
          <textarea
            name="observation"
            rows={4}
            maxLength={4000}
            required
            className="min-h-28 w-full resize-y rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]"
            placeholder="Record an objective, school-relevant observation."
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-medium">General remark (optional)</span>
          <textarea
            name="generalRemark"
            rows={3}
            maxLength={4000}
            className="min-h-24 w-full resize-y rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]"
            placeholder="Optional routine remark for the cumulative record."
          />
        </label>
        <div>
          <Button type="submit" loading={pending} disabled={pending}>
            Save CRC contribution
          </Button>
        </div>
      </form>
    </section>
  );
}
