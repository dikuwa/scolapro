"use client";

import { useActionState, useEffect } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  acknowledgeCrcRequestEscalation,
  type CrcCustodyActionState,
} from "@/features/crc/server/actions";
import type { CrcNetworkEscalation } from "@/features/crc/server/custody";

const initialState: CrcCustodyActionState = {};

function AcknowledgeEscalation({ escalationId }: { escalationId: string }) {
  const [state, action, pending] = useActionState(acknowledgeCrcRequestEscalation, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="escalationId" value={escalationId} />
      <button
        type="submit"
        disabled={pending}
        className="scolapro-cta inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-xs)] bg-surface-muted px-3 text-xs font-medium hover:bg-surface disabled:opacity-60"
      >
        <Check className="size-3.5" aria-hidden="true" />
        {pending ? "Acknowledging…" : "Acknowledge referral"}
      </button>
    </form>
  );
}

export function CrcNetworkEscalations({
  escalations,
}: {
  escalations: CrcNetworkEscalation[];
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
      <div className="flex items-start gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
        <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="scolapro-section-title">CRC request referrals</h2>
          <p className="scolapro-section-description">
            Referral metadata only. Learner identity, confidential CRC content, counselling, health and psychometric records are not exposed to circuit or regional users here.
          </p>
        </div>
      </div>
      {escalations.length ? (
        <div className="divide-y divide-border-subtle">
          {escalations.map((item) => (
            <article
              key={item.escalationId}
              className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="scolapro-record-title">{item.originSchoolName} → {item.receivingSchoolName}</p>
                  <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-[0.68rem] font-medium text-muted-foreground">
                    {item.scopeKind}
                  </span>
                  <span className="rounded-[var(--radius-xs)] bg-[color:var(--accent-amber-soft)] px-2 py-1 text-[0.68rem] font-medium text-[color:var(--accent-amber)]">
                    {item.escalationStatus}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Response due {item.responseDueOn} · request {item.requestStatus.replaceAll("_", " ")}
                </p>
              </div>
              {item.escalationStatus === "open" ? <AcknowledgeEscalation escalationId={item.escalationId} /> : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="px-4 py-10 text-center sm:px-5">
          <p className="text-sm font-medium">No CRC referrals in your current network scope</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Only overdue requests explicitly escalated through an effective circuit or regional relationship appear here.
          </p>
        </div>
      )}
    </section>
  );
}
