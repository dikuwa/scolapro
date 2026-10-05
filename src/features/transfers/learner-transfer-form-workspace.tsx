"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { CheckCircle2, FileText, Save, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { OfficialDocumentActions } from "@/components/documents/official-document-actions";
import { Button } from "@/components/ui/button";
import {
  finalizeLearnerTransferForm,
  generateLearnerTransferFormSummary,
  saveLearnerTransferFormDraft,
  type TransferFormActionState,
} from "@/features/transfers/server/actions";
import type {
  LearnerTransferFormDraft,
  LearnerTransferFormFinalization,
  LearnerTransferFormSource,
} from "@/features/transfers/server/transfer-form";

const initialState: TransferFormActionState = {};

function fieldClass() {
  return "w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";
}

function displayDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-NA", { dateStyle: "long" }).format(new Date(`${value}T12:00:00`));
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value || "Not recorded"}</p>
    </div>
  );
}

export function LearnerTransferFormWorkspace({
  source,
  draft,
  finalization,
}: {
  source: LearnerTransferFormSource;
  draft: LearnerTransferFormDraft | null;
  finalization: LearnerTransferFormFinalization | null;
}) {
  const [saveState, saveAction, saving] = useActionState(saveLearnerTransferFormDraft, initialState);
  const [aiPending, startAiTransition] = useTransition();
  const [finalizeState, finalizeAction, finalizing] = useActionState(finalizeLearnerTransferForm, initialState);

  const [reason, setReason] = useState(draft?.reasonForDeparture || source.reasonForDeparture);
  const [mediumOfInstruction, setMediumOfInstruction] = useState(draft?.mediumOfInstruction ?? "");
  const documentOptions = ["Birth certificate", "Latest report card", "Previous report card(s)", "Certified ID / passport copy", "CRC / cumulative record package"] as const;
  const initialDocuments = (draft?.documentsAttached ?? "").split(" · ").map((item) => item.trim()).filter(Boolean);
  const [documentSelections, setDocumentSelections] = useState<string[]>(initialDocuments.filter((item) => !item.startsWith("Other:")));
  const [otherDocument, setOtherDocument] = useState(initialDocuments.find((item) => item.startsWith("Other:"))?.replace(/^Other:\s*/, "") ?? "");
  const documents = [...documentSelections, ...(otherDocument.trim() ? [`Other: ${otherDocument.trim()}`] : [])].join(" · ");
  const [behaviour, setBehaviour] = useState(draft?.behaviourSummary || source.suggestions.behaviour);
  const [health, setHealth] = useState(draft?.healthSummary || source.suggestions.health);
  const [other, setOther] = useState(draft?.otherRelevantInformation || source.suggestions.otherRelevantInformation);
  const [verification, setVerification] = useState(draft?.verificationNote ?? "");

  useEffect(() => {
    if (!saveState.message) return;
    if (saveState.success) toast.success(saveState.message);
    else toast.error(saveState.message);
  }, [saveState]);

  function requestAiSummary(field: "behaviour" | "health" | "other") {
    startAiTransition(async () => {
      const formData = new FormData();
      formData.set("transferEventId", source.transferEventId);
      formData.set("summaryField", field);
      const result = await generateLearnerTransferFormSummary(initialState, formData);
      if (result.success && result.suggestionText) {
        if (field === "behaviour") setBehaviour(result.suggestionText);
        else if (field === "health") setHealth(result.suggestionText);
        else setOther(result.suggestionText);
      }
      if (result.message) {
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
      }
    });
  }

  useEffect(() => {
    if (!finalizeState.message) return;
    if (finalizeState.success) toast.success(finalizeState.message);
    else toast.error(finalizeState.message);
  }, [finalizeState]);

  const subjectNames = source.subjects.map((subject) => subject.subjectName).filter(Boolean);
  const sourceCount =
    source.suggestionProvenance.behaviour.length +
    source.suggestionProvenance.health.length +
    source.suggestionProvenance.otherRelevantInformation.length;

  return (
    <div className="space-y-5">
      {finalization ? (
        <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="scolapro-tone-mint grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
                <CheckCircle2 className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="scolapro-section-title">Finalized official form · revision {finalization.revision}</h2>
                <p className="scolapro-section-description">
                  {finalization.scolaproReference} · finalized {new Intl.DateTimeFormat("en-NA", { dateStyle: "medium" }).format(new Date(finalization.finalizedAt))}
                </p>
              </div>
            </div>
            <OfficialDocumentActions
              previewHref={`/api/official-documents/learner-transfer-form/${finalization.snapshotId}?format=pdf&preview=1`}
              downloadHref={`/api/official-documents/learner-transfer-form/${finalization.snapshotId}?format=pdf`}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The prescribed two-page government form is rendered from this immutable revision, including the official completion-instructions page. Editing the working fields below does not change this finalized version.
          </p>
        </section>
      ) : null}

      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
        <div className="border-b border-border-subtle px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
              <FileText className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="scolapro-section-title">Authoritative transfer details</h2>
              <p className="scolapro-section-description">These fields are read from the learner, enrolment, subject-registration and governed transfer records. They are not retyped into a second learner record.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
          <InfoItem label="Learner" value={source.learnerName} />
          <InfoItem label="Date of birth" value={displayDate(source.dateOfBirth)} />
          <InfoItem label="Present grade" value={source.presentGrade} />
          <InfoItem label="Last grade passed" value={source.lastGradePassed} />
          <InfoItem label="Source school" value={source.school.schoolName} />
          <InfoItem label="New school" value={[source.newSchool, source.newSchoolAddress].filter(Boolean).join(" · ")} />
          <InfoItem label="Departure date" value={displayDate(source.departureDate)} />
          <InfoItem label="Transfer status" value={source.transferStatus} />
        </div>
        <div className="border-t border-border-subtle px-4 py-4 sm:px-5">
          <p className="text-xs font-medium text-muted-foreground">Subjects</p>
          <p className="mt-1 text-sm">{subjectNames.length ? subjectNames.join(" · ") : "No authoritative subject registrations found for the source enrolment."}</p>
        </div>
      </section>

      <form action={saveAction} className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <input type="hidden" name="transferEventId" value={source.transferEventId} />
        <div>
          <h2 className="scolapro-section-title">Human verification</h2>
          <p className="scolapro-section-description">Review every value before finalization. Suggested text is editable and its source provenance remains attached to the finalized snapshot.</p>
        </div>

        <div className="mt-4 grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium">Reason for departure</span>
            <textarea name="reasonForDeparture" rows={3} maxLength={4000} required value={reason} onChange={(event) => setReason(event.target.value)} className={fieldClass()} />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium">Medium of instruction (only grades 1, 2 &amp; 3)</span>
            <input
              name="mediumOfInstruction"
              value={mediumOfInstruction}
              onChange={(event) => setMediumOfInstruction(event.target.value)}
              maxLength={500}
              className={fieldClass()}
              placeholder="Complete only where the prescribed form requires it."
            />
          </label>

          <fieldset className="grid gap-2">
            <legend className="text-xs font-medium">Documents attached</legend>
            <input type="hidden" name="documentsAttached" value={documents} />
            <div className="grid gap-2 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-2">
              {documentOptions.map((label) => (
                <label key={label} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={documentSelections.includes(label)} onChange={(event) => setDocumentSelections((current) => event.target.checked ? [...current, label] : current.filter((item) => item !== label))} className="mt-0.5 size-4 accent-[var(--brand)]" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <label className="grid gap-1.5">
              <span className="text-[0.68rem] font-medium text-muted-foreground">Other document</span>
              <input value={otherDocument} onChange={(event) => setOtherDocument(event.target.value)} maxLength={500} className={fieldClass()} placeholder="Optional additional attachment" />
            </label>
          </fieldset>

          <div className="grid gap-4 lg:grid-cols-3">
            <label className="grid gap-1.5">
              <span className="flex items-center justify-between gap-2 text-xs font-medium">
                Behaviour
                {source.suggestions.behaviour ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setBehaviour(source.suggestions.behaviour)} className="inline-flex items-center gap-1 text-[color:var(--brand)] hover:underline"><Sparkles className="size-3" aria-hidden="true" />Use source</button>
                    <button type="button" onClick={() => requestAiSummary("behaviour")} disabled={aiPending} className="inline-flex items-center gap-1 text-[color:var(--brand)] hover:underline disabled:opacity-50"><Sparkles className="size-3" aria-hidden="true" />{aiPending ? "Summarizing…" : "AI summarize"}</button>
                  </span>
                ) : null}
              </span>
              <textarea name="behaviourSummary" rows={6} maxLength={4000} value={behaviour} onChange={(event) => setBehaviour(event.target.value)} className={fieldClass()} />
            </label>

            <label className="grid gap-1.5">
              <span className="flex items-center justify-between gap-2 text-xs font-medium">
                State of health
                {source.suggestions.health ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setHealth(source.suggestions.health)} className="inline-flex items-center gap-1 text-[color:var(--brand)] hover:underline"><Sparkles className="size-3" aria-hidden="true" />Use source</button>
                    <button type="button" onClick={() => requestAiSummary("health")} disabled={aiPending} className="inline-flex items-center gap-1 text-[color:var(--brand)] hover:underline disabled:opacity-50"><Sparkles className="size-3" aria-hidden="true" />{aiPending ? "Summarizing…" : "AI summarize"}</button>
                  </span>
                ) : null}
              </span>
              <textarea name="healthSummary" rows={6} maxLength={4000} value={health} onChange={(event) => setHealth(event.target.value)} className={fieldClass()} placeholder={source.suggestionProvenance.healthAuthorized ? "No authorized health suggestion is available." : "No health suggestion is exposed without explicit support authority."} />
            </label>

            <label className="grid gap-1.5">
              <span className="flex items-center justify-between gap-2 text-xs font-medium">
                Other relevant information
                {source.suggestions.otherRelevantInformation ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setOther(source.suggestions.otherRelevantInformation)} className="inline-flex items-center gap-1 text-[color:var(--brand)] hover:underline"><Sparkles className="size-3" aria-hidden="true" />Use source</button>
                    <button type="button" onClick={() => requestAiSummary("other")} disabled={aiPending} className="inline-flex items-center gap-1 text-[color:var(--brand)] hover:underline disabled:opacity-50"><Sparkles className="size-3" aria-hidden="true" />{aiPending ? "Summarizing…" : "AI summarize"}</button>
                  </span>
                ) : null}
              </span>
              <textarea name="otherRelevantInformation" rows={6} maxLength={4000} value={other} onChange={(event) => setOther(event.target.value)} className={fieldClass()} />
            </label>
          </div>

          <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3 text-xs leading-5 text-muted-foreground">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                {sourceCount} permitted source {sourceCount === 1 ? "record" : "records"} currently support the suggestions. Counselling notes, psychometric records and highly restricted support cases are not used by this form.
              </p>
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium">Verification note</span>
            <textarea name="verificationNote" rows={3} maxLength={2000} value={verification} onChange={(event) => setVerification(event.target.value)} className={fieldClass()} placeholder="Record how the form was checked before principal finalization." />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <Link href="/school/crc-custody" className="text-sm font-medium text-muted-foreground hover:text-foreground">← CRC custody</Link>
            <Button type="submit" loading={saving} disabled={saving}>
              <Save className="size-4" aria-hidden="true" />
              Save draft
            </Button>
          </div>
        </div>
      </form>

      <section className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Finalize official form</h2>
        <p className="scolapro-section-description">
          Finalization freezes the verified values, canonical learner/transfer data, school identity and suggestion provenance. A later correction creates a new revision.
        </p>
        <form action={finalizeAction} className="mt-4">
          <input type="hidden" name="transferEventId" value={source.transferEventId} />
          <Button type="submit" loading={finalizing} disabled={finalizing || !verification.trim()}>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {finalization ? "Finalize new revision" : "Finalize transfer form"}
          </Button>
        </form>
        {!verification.trim() ? <p className="mt-2 text-xs text-muted-foreground">Save a verification note before finalization.</p> : null}
      </section>
    </div>
  );
}
