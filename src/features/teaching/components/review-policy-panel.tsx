"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import {
  setPreparationReviewPolicy,
  type ReviewActionState,
} from "@/features/teaching/server/review-actions";
import type { PreparationReviewPolicy } from "@/features/teaching/server/review-queries";

const initialState:ReviewActionState={success:false,message:""};
const labels:Record<PreparationReviewPolicy["cadence"],string>={
  weekly:"Weekly",
  fortnightly:"Fortnightly",
  selected:"Selected preparations",
  term_batch:"Term batch",
};

export function ReviewPolicyPanel({policy}:{policy:PreparationReviewPolicy}) {
  const [state,action,pending]=useActionState(setPreparationReviewPolicy,initialState);
  return <section className="mb-5 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="scolapro-section-title">Preparation review cadence</h2>
        <p className="scolapro-section-description">Current school policy: {labels[policy.cadence]}. Cadence guides how teachers group submissions; it does not rank productivity or mutate lesson content.</p>
      </div>
      <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.64rem] font-semibold uppercase tracking-wide text-muted-foreground">Effective {policy.effectiveFrom}</span>
    </div>
    {policy.canManage ? <form action={action} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <Picker
          label="School cadence"
          name="cadence"
          value={policy.cadence}
          options={[
            {value:"weekly",label:"Weekly"},
            {value:"fortnightly",label:"Fortnightly"},
            {value:"selected",label:"Selected preparations"},
            {value:"term_batch",label:"Term batch"},
          ]}
        />
      </div>
      <Button type="submit" loading={pending}>Save cadence</Button>
    </form> : null}
    {state.message ? <p className={`mt-3 text-xs ${state.success?"text-success":"text-danger"}`}>{state.message}</p> : null}
  </section>;
}
