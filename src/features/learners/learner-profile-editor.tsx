"use client";

import { useActionState, useRef, useState } from "react";
import { Camera, ImagePlus, Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { updateLearnerOperationalProfile, type LearnerProfileState } from "@/features/learners/server/actions";

const initialState: LearnerProfileState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function LearnerProfileEditor({ learnerId, schoolId, preferredName, hasPhoto }: { learnerId: string; schoolId: string; preferredName: string | null; hasPhoto: boolean }) {
  const [open, setOpen] = useState(false);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [state, action, pending] = useActionState(async (previousState: LearnerProfileState, formData: FormData) => {
    const result = await updateLearnerOperationalProfile(previousState, formData);
    if (result.message) {
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    }
    if (result.success) {
      setOpen(false);
      setRemovePhoto(false);
      setSelectedPhoto(null);
      if (fileRef.current) fileRef.current.value = "";
    }
    return result;
  }, initialState);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setRemovePhoto(false);
    setSelectedPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="w-full sm:w-auto">
      <button type="button" onClick={() => open ? close() : setOpen(true)} aria-expanded={open} className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium text-foreground shadow-[var(--shadow-xs)] transition duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:border-border hover:bg-surface-muted sm:w-auto">
        {open ? <X className="size-3.5" aria-hidden="true" /> : <Pencil className="size-3.5" aria-hidden="true" />}
        {open ? "Close edit" : "Edit learner"}
      </button>

      {open ? (
        <form action={action} className="mt-3 w-full rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-sm)] sm:min-w-[28rem] sm:p-5" noValidate>
          <input type="hidden" name="learnerId" value={learnerId} />
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="removePhoto" value={removePhoto ? "true" : "false"} />

          <div className="flex items-start justify-between gap-3">
            <div><h2 className="scolapro-section-title">Edit learner</h2><p className="scolapro-section-description">Update ordinary school-maintained profile information here.</p></div>
            <button type="button" onClick={close} disabled={pending} className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground disabled:opacity-50" aria-label="Close learner editor"><X className="size-4" aria-hidden="true" /></button>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor={`preferred-name-${learnerId}`} className="text-xs font-medium">Preferred name</label>
              <input id={`preferred-name-${learnerId}`} name="preferredName" defaultValue={preferredName ?? ""} className={`${fieldClass} mt-1.5`} placeholder="Name used in day-to-day school interactions" />
              <p className="mt-1 text-[0.68rem] text-muted-foreground">This does not alter the learner&apos;s official registered names.</p>
              {state.fieldErrors?.preferredName?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{state.fieldErrors.preferredName[0]}</p> : null}
            </div>

            <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3">
              <div className="flex items-center gap-2"><Camera className="size-4 text-muted-foreground" aria-hidden="true" /><p className="text-xs font-semibold">Profile photo</p></div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium transition hover:border-border hover:bg-surface-elevated">
                  <ImagePlus className="size-3.5" aria-hidden="true" />
                  {hasPhoto ? "Choose new photo" : "Add photo"}
                  <input ref={fileRef} type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; setSelectedPhoto(file?.name ?? null); if (file) setRemovePhoto(false); }} />
                </label>
                {hasPhoto ? <button type="button" onClick={() => { setRemovePhoto((value) => !value); if (fileRef.current) fileRef.current.value = ""; setSelectedPhoto(null); }} className={`inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-xs font-medium transition ${removePhoto ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)]" : "text-muted-foreground hover:bg-[color:var(--danger-soft)] hover:text-[color:var(--danger)]"}`}><Trash2 className="size-3.5" aria-hidden="true" />{removePhoto ? "Photo will be removed" : "Remove photo"}</button> : null}
              </div>
              {selectedPhoto ? <p className="mt-2 truncate text-[0.68rem] text-brand-strong">Selected: {selectedPhoto}</p> : null}
              {state.fieldErrors?.photo?.[0] ? <p className="mt-2 text-xs text-[color:var(--danger)]">{state.fieldErrors.photo[0]}</p> : null}
              <p className="mt-2 text-[0.66rem] text-muted-foreground">JPG, PNG or WebP · maximum 5 MB.</p>
            </div>

            <div className="rounded-[var(--radius-sm)] border border-border-subtle px-3 py-3">
              <p className="text-xs font-semibold">Protected official information</p>
              <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">Official names, date of birth, sex, admission identity and historical enrolment records are not silently overwritten here. Use the correction workflow on the learner overview when those details are wrong.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
            <button type="button" onClick={close} disabled={pending} className="min-h-9 rounded-[var(--radius-sm)] px-3 text-xs font-medium text-muted-foreground transition hover:bg-surface-muted disabled:opacity-50">Close</button>
            <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-9 items-center gap-2 bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-60">{pending ? <Spinner className="size-3.5 text-white" /> : <Save className="size-3.5" aria-hidden="true" />}{pending ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
