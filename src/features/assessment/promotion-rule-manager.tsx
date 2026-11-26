"use client";

import { useActionState, useEffect, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Button } from "@/components/ui/button";
import { activatePromotionRuleVersion, createPromotionRuleVersion, type PromotionRuleActionState } from "@/features/assessment/server/promotion-rules";
import { DateField } from "@/components/ui/date-field";

type Rule = { id: string; gradeId: string; key: string; version: string; status: string; sourceReference: string | null };
const initialState: PromotionRuleActionState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground outline-none focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function PromotionRuleManager({ schoolId, academicYear, grades, rules }: { schoolId: string; academicYear: number; grades: { id: string; name: string }[]; rules: Rule[] }) {
  const [state, action, pending] = useActionState(createPromotionRuleVersion, initialState);
  const [activateState, activateAction, activating] = useActionState(activatePromotionRuleVersion, initialState);
  const [gradeId, setGradeId] = useState("");
  const [conditionType, setConditionType] = useState("");
  const [resultTermNumber, setResultTermNumber] = useState("");
  const [passOutcome, setPassOutcome] = useState("");
  const [failOutcome, setFailOutcome] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  useEffect(() => { if (state.message) state.success ? toast.success(state.message) : toast.error(state.message); }, [state]);
  useEffect(() => { if (activateState.message) activateState.success ? toast.success(activateState.message) : toast.error(activateState.message); }, [activateState]);
  return <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5" aria-labelledby="promotion-rules-title">
    <div><h2 id="promotion-rules-title" className="scolapro-section-title">Promotion rules</h2><p className="scolapro-section-description">Create a version from the school’s approved policy source. Thresholds are entered by the school; ScolaPro does not supply statutory defaults.</p></div>
    <div className="mt-4 divide-y divide-border-subtle border-y border-border-subtle">{rules.map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="scolapro-record-title">{rule.key} · v{rule.version}</p><p className="text-xs text-muted-foreground">{grades.find((grade) => grade.id === rule.gradeId)?.name ?? "Grade"} · {rule.status}{rule.sourceReference ? ` · ${rule.sourceReference}` : ""}</p></div>{rule.status === "draft" ? <form action={activateAction}><input type="hidden" name="ruleSetId" value={rule.id} /><Button type="submit" size="sm" variant="soft" disabled={activating}>{activating ? <LoaderCircle className="size-3.5 animate-spin" /> : null}{activating ? "Activating…" : "Activate version"}</Button></form> : null}</div>)}{!rules.length ? <p className="py-3 text-sm text-muted-foreground">No promotion rule versions are configured for {academicYear}.</p> : null}</div>
    <form action={action} className="mt-4 space-y-4 border-t border-border-subtle pt-4" noValidate>
      <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="academicYear" value={academicYear} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Picker label="Source grade" name="gradeId" value={gradeId} onChange={setGradeId} options={grades.map((grade) => ({ value: grade.id, label: grade.name }))} placeholder="Choose grade" />
        <div><label className="text-xs font-medium" htmlFor="promotion-rule-key">Rule-set key</label><input id="promotion-rule-key" name="ruleSetKey" className={`${fieldClass} mt-1.5`} placeholder="school-policy-2026" /></div>
        <div><label className="text-xs font-medium" htmlFor="promotion-rule-version">Version</label><input id="promotion-rule-version" name="version" className={`${fieldClass} mt-1.5`} placeholder="1.0" /></div>
        <Picker label="Result term" name="resultTermNumber" value={resultTermNumber} onChange={setResultTermNumber} options={[1, 2, 3, 4, 5, 6].map((value) => ({ value: String(value), label: `Term ${value}` }))} placeholder="Choose term" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Picker label="Condition type" name="conditionType" value={conditionType} onChange={setConditionType} options={["minimum_subject_result", "minimum_passed_subjects", "maximum_failed_subjects", "minimum_overall_average", "minimum_attendance_rate", "manual_review_required"].map((value) => ({ value, label: value.replaceAll("_", " ") }))} placeholder="Choose condition" />
        <div><label className="text-xs font-medium" htmlFor="promotion-condition-code">Condition code</label><input id="promotion-condition-code" name="conditionCode" className={`${fieldClass} mt-1.5`} placeholder="approved-condition-1" /></div>
        <div><label className="text-xs font-medium" htmlFor="promotion-threshold">Threshold <span className="font-normal text-muted-foreground">(policy value)</span></label><input id="promotion-threshold" name="threshold" inputMode="decimal" className={`${fieldClass} mt-1.5`} placeholder="Enter approved value" /></div>
        <div><label className="text-xs font-medium" htmlFor="promotion-subject">Subject code <span className="font-normal text-muted-foreground">(if required)</span></label><input id="promotion-subject" name="subjectCode" className={`${fieldClass} mt-1.5`} placeholder="e.g. Mathematics" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Picker label="Passing outcome" name="passOutcome" value={passOutcome} onChange={setPassOutcome} options={["promoted", "condoned", "completed", "pending"].map((value) => ({ value, label: value.replaceAll("_", " ") }))} placeholder="Choose outcome" /><Picker label="Failing outcome" name="failOutcome" value={failOutcome} onChange={setFailOutcome} options={["not_promoted", "pending"].map((value) => ({ value, label: value.replaceAll("_", " ") }))} placeholder="Choose outcome" /><DateField label="Effective from" name="effectiveFrom" value={effectiveFrom} onChange={setEffectiveFrom} required /><div><label className="text-xs font-medium" htmlFor="promotion-source">Policy source reference</label><input id="promotion-source" name="sourceReference" className={`${fieldClass} mt-1.5`} placeholder="Approved source or decision" /></div></div>
      <div className="flex justify-end border-t border-border-subtle pt-4"><Button type="submit" disabled={pending || !grades.length}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}{pending ? "Saving…" : "Save draft rule"}</Button></div>
    </form>
  </section>;
}
