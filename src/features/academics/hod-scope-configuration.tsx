"use client";

import { useActionState, useMemo, useState } from "react";
import { Network, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import {
  createHodSubjectResponsibility,
  endHodSubjectResponsibility,
  type HodScopeActionState,
} from "./server/hod-scope-actions";
import type {
  HodScopeHeadOption,
  HodScopeResponsibility,
  HodScopeSubject,
} from "./server/hod-scope";

const emptyState: HodScopeActionState = {};
const fieldClass =
  "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-fast)] focus:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]";

function ActionMessage({ state }: { state: HodScopeActionState }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      className={
        state.success
          ? "rounded-[var(--radius-sm)] bg-success-soft/60 px-3 py-2 text-xs text-[color:var(--success)]"
          : "rounded-[var(--radius-sm)] bg-danger-soft/60 px-3 py-2 text-xs text-[color:var(--danger)]"
      }
    >
      {state.message}
    </p>
  );
}

function statusFor(row: HodScopeResponsibility, today: string) {
  if (row.effectiveFrom > today) return "Upcoming";
  if (row.effectiveTo && row.effectiveTo < today) return "Ended";
  return "Active";
}

export function HodScopeConfiguration({
  schoolId,
  subjects,
  heads,
  responsibilities,
  today,
}: {
  schoolId: string;
  subjects: HodScopeSubject[];
  heads: HodScopeHeadOption[];
  responsibilities: HodScopeResponsibility[];
  today: string;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [effectiveTo, setEffectiveTo] = useState("");
  const [endResponsibilityId, setEndResponsibilityId] = useState("");
  const [endDate, setEndDate] = useState(today);

  const [createState, createAction, createPending] = useActionState(
    createHodSubjectResponsibility,
    emptyState,
  );
  const [endState, endAction, endPending] = useActionState(
    endHodSubjectResponsibility,
    emptyState,
  );

  const subjectOptions = useMemo(
    () =>
      subjects.map((subject) => ({
        value: subject.id,
        label: subject.name,
        helper: subject.code,
      })),
    [subjects],
  );
  const headOptions = useMemo(
    () =>
      heads.map((head) => ({
        value: head.assignmentId,
        label: head.name,
        helper: "Current HOD placement",
      })),
    [heads],
  );
  const endOptions = useMemo(
    () =>
      responsibilities
        .filter((row) => statusFor(row, today) !== "Ended")
        .map((row) => ({
          value: row.id,
          label: `${row.subjectName} · ${row.headName}`,
          helper: `From ${row.effectiveFrom}`,
        })),
    [responsibilities, today],
  );

  return (
    <section
      id="hod-scope"
      className="mt-5 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
          <Network className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="scolapro-section-title">HOD teaching scope</h2>
          <p className="scolapro-section-description">
            Assign explicit subjects to an HOD. One HOD may hold several subjects, and a school may
            split or combine portfolios without adopting a fixed national department structure.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            These effective-dated subject responsibilities remain the authorization source for HOD
            preparation review and teaching-plan authoring. Labels such as Languages, Mathematics &
            Natural Sciences, Commerce, or phase portfolios are suggestions only and are not encoded
            as official structures.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Current responsibility history</h3>
          <div className="mt-3 divide-y divide-border-subtle rounded-[var(--radius-sm)] border border-border-subtle">
            {responsibilities.length ? (
              responsibilities.map((row) => {
                const status = statusFor(row, today);
                return (
                  <div key={row.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {row.subjectName}
                        {row.subjectCode ? (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {row.subjectCode}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.headName} · {row.effectiveFrom} → {row.effectiveTo ?? "open"}
                      </p>
                    </div>
                    <span className="self-start rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-xs font-medium text-foreground">
                      {status}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium text-foreground">No HOD scope configured</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Add explicit subject responsibilities before HOD review or planning authority is expected.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <form action={createAction} className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle p-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Add responsibility</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Only current HOD staff placements are offered. The HOD does not need to teach the subject.
              </p>
            </div>
            <ActionMessage state={createState} />
            <input type="hidden" name="schoolId" value={schoolId} />
            <Picker
              label="Subject"
              name="subjectId"
              value={subjectId}
              onChange={setSubjectId}
              options={subjectOptions}
              placeholder="Choose subject"
              disabled={!subjects.length || createPending}
            />
            <Picker
              label="HOD"
              name="assignmentId"
              value={assignmentId}
              onChange={setAssignmentId}
              options={headOptions}
              placeholder="Choose HOD"
              disabled={!heads.length || createPending}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField
                label="Effective from"
                name="effectiveFrom"
                value={effectiveFrom}
                onChange={setEffectiveFrom}
                disabled={createPending}
              />
              <DateField
                label="Effective to (optional)"
                name="effectiveTo"
                value={effectiveTo}
                onChange={setEffectiveTo}
                disabled={createPending}
              />
            </div>
            <div className="flex justify-start sm:justify-end">
              <Button
                type="submit"
                loading={createPending}
                disabled={!subjectId || !assignmentId || !effectiveFrom}
              >
                <Plus className="size-4" aria-hidden="true" />
                Add responsibility
              </Button>
            </div>
          </form>

          <form action={endAction} className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle p-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">End responsibility</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Ending a responsibility preserves the original assignment and its historical provenance.
              </p>
            </div>
            <ActionMessage state={endState} />
            <input type="hidden" name="schoolId" value={schoolId} />
            <Picker
              label="Responsibility"
              name="responsibilityId"
              value={endResponsibilityId}
              onChange={setEndResponsibilityId}
              options={endOptions}
              placeholder="Choose responsibility"
              disabled={!endOptions.length || endPending}
            />
            <DateField
              label="Effective to"
              name="effectiveTo"
              value={endDate}
              onChange={setEndDate}
              disabled={endPending}
            />
            <div className="flex justify-start sm:justify-end">
              <Button
                type="submit"
                variant="neutral"
                loading={endPending}
                disabled={!endResponsibilityId || !endDate}
              >
                End responsibility
              </Button>
            </div>
          </form>
        </div>
      </div>

      {!heads.length ? (
        <p className={fieldClass}>
          No current HOD placement is available. Assign the HOD role and an effective staff placement first.
        </p>
      ) : null}
    </section>
  );
}
