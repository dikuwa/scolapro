"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FileCheck2 } from "lucide-react";
import {
  finalizeAcademicSchedule,
  type AcademicScheduleActionState,
} from "@/features/reporting/server/academic-schedule-actions";
import type { AcademicScheduleType } from "@/features/reporting/server/academic-schedules";

const initialState: AcademicScheduleActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] bg-brand px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      <FileCheck2 className="size-3.5" aria-hidden="true" />
      {pending ? "Finalizing…" : "Finalize version"}
    </button>
  );
}

export function AcademicScheduleFinalizeForm({
  academicYear,
  termNumber,
  scheduleType,
  replacingFinalizedVersion,
  grade,
  classNames,
}: {
  academicYear: number;
  termNumber: number;
  scheduleType: AcademicScheduleType;
  replacingFinalizedVersion: boolean;
  grade?: string;
  classNames?: string[];
}) {
  const [state, formAction] = useActionState(finalizeAcademicSchedule, initialState);
  return (
    <form action={formAction} className="flex min-w-[16rem] flex-col gap-2">
      <input type="hidden" name="academicYear" value={academicYear} />
      <input type="hidden" name="termNumber" value={termNumber} />
      <input type="hidden" name="scheduleType" value={scheduleType} />
      <input type="hidden" name="basis" value="official" />
      <input type="hidden" name="grade" value={grade??""} />
      <input type="hidden" name="classNames" value={JSON.stringify(classNames??[])} />
      {replacingFinalizedVersion ? (
        <input
          required
          maxLength={1000}
          name="supersessionReason"
          placeholder="Reason for corrected version"
          className="scolapro-control-surface min-h-9 rounded-[var(--radius-sm)] px-3 text-xs"
        />
      ) : null}
      <SubmitButton />
      {state.message ? (
        <p
          role="status"
          className={state.success ? "text-xs text-[color:var(--success)]" : "text-xs text-[color:var(--danger)]"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
