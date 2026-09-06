"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Save } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import {
  saveReportCardRemark,
  type ReportCardRemarkActionState,
} from "@/features/reporting/server/report-card-remark-actions";

const initialState: ReportCardRemarkActionState = {};

export function ReportCardManualRemarkEditor({
  snapshotId,
  learnerName,
  remark,
}: {
  snapshotId: string;
  learnerName: string;
  remark: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveReportCardRemark, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      router.refresh();
    } else {
      toast.error(state.message);
    }
  }, [router, state]);

  return (
    <section className="mb-5 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="scolapro-tone-sky grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
          <MessageSquareText className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="scolapro-section-title">Reviewed learner remark</h2>
          <p className="scolapro-section-description">
            Add the learner-specific remark for {learnerName}. It can be edited while this snapshot is still a draft; certification freezes it into the historical report.
          </p>
        </div>
      </div>

      <form action={action} className="mt-4">
        <input type="hidden" name="snapshotId" value={snapshotId} />
        <label htmlFor={`report-remark-${snapshotId}`} className="text-xs font-medium">Report-card remark</label>
        <textarea
          id={`report-remark-${snapshotId}`}
          name="remark"
          defaultValue={remark}
          maxLength={1200}
          rows={4}
          className="mt-1.5 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm leading-6 text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]"
          placeholder="Enter a reviewed learner-specific remark. Leave blank to use the school's configured fallback remark."
        />
        {state.fieldErrors?.remark?.length ? <p className="mt-1 text-xs text-destructive">{state.fieldErrors.remark[0]}</p> : null}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-[0.68rem] leading-5 text-muted-foreground">
            Blank uses the school fallback remark. The remark itself is frozen in the certified snapshot; audit history records who saved it without copying the confidential text into audit metadata.
          </p>
          <button
            type="submit"
            disabled={pending}
            className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
            {pending ? "Saving…" : "Save remark"}
          </button>
        </div>
      </form>
    </section>
  );
}
