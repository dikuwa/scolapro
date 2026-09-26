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

const options=[
  {value:"weekly",label:"Weekly"},
  {value:"fortnightly",label:"Fortnightly"},
  {value:"selected",label:"Selected preparations"},
  {value:"term_batch",label:"Term batch"},
];

export function PreparationReviewPolicyCard({policy}:{policy:PreparationReviewPolicy}) {
  const [state,action,pending]=useActionState(setPreparationReviewPolicy,initialState);
  return <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="scolapro-section-title">Review cadence</h2>
        <p className="scolapro-section-description">Controls the school&apos;s preferred preparation submission rhythm. It does not alter lesson content, review authority or historical submissions.</p>
      </div>
      {policy.canManage ? <form action={action} className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-72 sm:flex-row sm:items-end">
        <Picker label="Cadence" name="cadence" defaultValue={policy.cadence} options={options}/>
        <Button type="submit" loading={pending}>Save cadence</Button>
      </form> : <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
        Current: {options.find((item)=>item.value===policy.cadence)?.label ?? policy.cadence}
      </div>}
    </div>
    {state.message ? <p className={`mt-3 text-xs ${state.success ? "text-success" : "text-danger"}`}>{state.message}</p> : null}
  </section>;
}
