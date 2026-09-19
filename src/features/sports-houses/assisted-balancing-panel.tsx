"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import {
  applySportsHouseBalancing,
  previewSportsHouseBalancing,
  type SportsBalanceActionState,
  type SportsBalancePreview,
} from "@/features/sports-houses/server/actions";

const initialState: SportsBalanceActionState = {};

function useBalanceToast(state: SportsBalanceActionState) {
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

function Totals({
  title,
  totals,
}: {
  title: string;
  totals: SportsBalancePreview["beforeTotals"];
}) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3 sm:p-4">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <div className="mt-3 space-y-2">
        {totals.map((item) => (
          <div key={item.houseId} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-muted-foreground">{item.houseName}</span>
            <span className="font-semibold tabular-nums text-foreground">{item.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveList({ preview }: { preview: SportsBalancePreview }) {
  if (!preview.moves.length) {
    return (
      <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-7 text-center">
        <p className="text-sm font-medium">No moves proposed</p>
        <p className="mt-1 text-xs text-muted-foreground">The eligible assignments are already balanced under the current configuration.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-subtle">
      {preview.moves.map((move) => (
        <article key={move.id} className="grid gap-2 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,.8fr)_minmax(13rem,1fr)] lg:items-center">
          <div className="min-w-0">
            <p className="scolapro-record-title truncate">{move.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {move.entityType === "learner"
                ? [move.sex, move.ageGroup, move.grade].filter(Boolean).join(" · ") || "No balancing cohort labels"
                : move.staffRoleKey === "leader" ? "House leader" : "Staff member"}
            </p>
          </div>

          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate text-muted-foreground">{move.fromHouseName ?? "Unassigned"}</span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-medium text-foreground">{move.toHouseName}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">Source: {move.assignmentSource ?? "unassigned"}</span>
            {move.isLocked ? (
              <span className="inline-flex items-center gap-1"><LockKeyhole className="size-3" aria-hidden="true" />Locked</span>
            ) : (
              <span>Unlocked</span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

export function AssistedBalancingPanel({
  schoolId,
  academicYear,
  operationId,
}: {
  schoolId: string;
  academicYear: number;
  operationId: string;
}) {
  const [scope, setScope] = useState<"learner" | "staff">("learner");
  const [nextOperationId, setNextOperationId] = useState(operationId);
  const [previewState, previewAction, previewPending] = useActionState(previewSportsHouseBalancing, initialState);
  const [applyState, applyAction, applyPending] = useActionState(applySportsHouseBalancing, initialState);
  useBalanceToast(previewState);
  useBalanceToast(applyState);
  useEffect(() => {
    if (previewState.success && previewState.preview) setNextOperationId(crypto.randomUUID());
  }, [previewState]);

  const preview = applyState.preview ?? previewState.preview ?? null;

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-brand" aria-hidden="true" />
            <h2 className="scolapro-section-title">Assisted balancing</h2>
          </div>
          <p className="scolapro-section-description">
            Preview deterministic balancing before any assignment changes. Manual and locked assignments stay fixed; staff leaders are never redistributed.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Learner proposals minimise total house imbalance first, then configured sex, age-group and grade cohorts. Staff are balanced separately by house size.
          </p>
        </div>

        <form action={previewAction} className="grid w-full gap-3 sm:grid-cols-[minmax(10rem,1fr)_auto] sm:items-end lg:w-auto">
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="academicYear" value={academicYear} />
          <input type="hidden" name="clientOperationId" value={nextOperationId} />
          <Picker
            label="Balance"
            name="scope"
            value={scope}
            onChange={(value) => setScope(value === "staff" ? "staff" : "learner")}
            options={[
              { value: "learner", label: "Learners" },
              { value: "staff", label: "Staff" },
            ]}
            placeholder="Choose scope"
          />
          <Button type="submit" loading={previewPending} disabled={applyPending}>Preview balance</Button>
        </form>
      </div>

      {preview ? (
        <div className="mt-5 border-t border-border-subtle pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold capitalize">{preview.scope} preview · {preview.moveCount} proposed {preview.moveCount === 1 ? "move" : "moves"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Algorithm {preview.algorithmVersion} · {preview.status === "applied" ? "Applied" : "Preview only"}
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-xs)] bg-info-soft px-2.5 py-1.5 text-xs font-medium text-[color:var(--info)]">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {preview.status === "applied" ? "Applied with audit evidence" : "No writes until Apply"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Totals title="Before totals" totals={preview.beforeTotals} />
            <Totals title="Proposed after totals" totals={preview.afterTotals} />
          </div>

          <div className="mt-5">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Proposed moves</h3>
                <p className="text-xs text-muted-foreground">Every affected learner/staff member is shown with source and lock state.</p>
              </div>
              {preview.scope === "learner" ? (
                <p className="text-xs text-muted-foreground">
                  Sex {preview.configuration.balanceBySex ? "on" : "off"} · Age group {preview.configuration.balanceByAgeGroup ? "on" : "off"} · Grade {preview.configuration.balanceByGrade ? "on" : "off"}
                </p>
              ) : null}
            </div>
            <MoveList preview={preview} />
          </div>

          {preview.status === "preview" && preview.moveCount > 0 ? (
            <form action={applyAction} className="mt-5 flex flex-col gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
              <input type="hidden" name="schoolId" value={schoolId} />
              <input type="hidden" name="runId" value={preview.id} />
              <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
                Apply checks that every eligible assignment still matches this preview. If anything changed, the entire apply is rejected and nothing is partially written.
              </p>
              <Button type="submit" loading={applyPending} disabled={previewPending}>Apply {preview.scope} balance</Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
