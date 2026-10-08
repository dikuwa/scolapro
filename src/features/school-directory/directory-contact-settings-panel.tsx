"use client";

import { useActionState, useEffect, useState } from "react";
import { ContactRound, LoaderCircle, Save, X } from "lucide-react";
import { toast } from "sonner";
import { formFieldLabelClass } from "@/components/ui/form-field-layout";
import { RecordActionButton } from "@/components/ui/record-action-button";
import { saveSchoolDirectoryContact, type SchoolDirectorySettingsState } from "@/features/school-directory/server/settings-actions";

const initialState: SchoolDirectorySettingsState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function DirectoryContactSettingsPanel({ schoolId, cellphone, principalPublicEmail }: { schoolId: string; cellphone: string; principalPublicEmail: string }) {
  const [state, action, pending] = useActionState(saveSchoolDirectoryContact, initialState);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      queueMicrotask(() => setOpen(false));
    } else {
      toast.error(state.message);
    }
  }, [state]);
  const cellphoneError = state.fieldErrors?.cellphone?.[0];
  const emailError = state.fieldErrors?.principalPublicEmail?.[0];

  return (
    <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className={open ? "border-b border-border-subtle pb-4" : ""}>
        <div className="flex items-start gap-3">
          <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><ContactRound className="size-4" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 className="scolapro-section-title">School Directory contact</h2>
            <p className="scolapro-section-description">Public directory fields shown to authenticated ScolaPro schools. Telephone, fax, school email and addresses keep their existing canonical fields above.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <RecordActionButton
            label={open ? "Close" : "Edit contact"}
            icon={open ? X : undefined}
            actionKind={open ? undefined : "edit"}
            variant="soft"
            compact={false}
            expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="min-h-9 px-3 text-xs"
          />
        </div>
      </div>
      <form action={action} className={open ? "mt-5 grid gap-4 md:grid-cols-2" : "hidden"} noValidate aria-hidden={!open}>
        <input type="hidden" name="schoolId" value={schoolId} />
        <div>
          <label className={formFieldLabelClass} htmlFor="directory-cellphone">Cellphone</label>
          <input id="directory-cellphone" name="cellphone" defaultValue={cellphone} maxLength={80} className={`${fieldClass} mt-1.5`} />
          <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">Shown to authenticated ScolaPro schools in the School Directory.</p>
          {cellphoneError ? <p className="mt-1 text-xs text-[color:var(--danger)]">{cellphoneError}</p> : null}
        </div>
        <div>
          <label className={formFieldLabelClass} htmlFor="directory-principal-email">Principal public email</label>
          <input id="directory-principal-email" name="principalPublicEmail" type="email" defaultValue={principalPublicEmail} className={`${fieldClass} mt-1.5`} />
          <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">Public contact email shown in the School Directory. This does not use the principal&apos;s private account email.</p>
          {emailError ? <p className="mt-1 text-xs text-[color:var(--danger)]">{emailError}</p> : null}
        </div>
        <div className="flex justify-end border-t border-border-subtle pt-4 md:col-span-2">
          <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}{pending ? "Saving…" : "Save directory contact"}
          </button>
        </div>
      </form>
    </div>
  );
}
