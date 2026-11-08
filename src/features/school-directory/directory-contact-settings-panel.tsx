"use client";

import { useActionState, useEffect, useState } from "react";
import { ContactRound, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { formFieldLabelClass } from "@/components/ui/form-field-layout";
import { ConfigurationCard } from "@/components/ui/configuration-card";
import { useRouter } from "next/navigation";
import { saveSchoolDirectoryContact, type SchoolDirectorySettingsState } from "@/features/school-directory/server/settings-actions";

const initialState: SchoolDirectorySettingsState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

export function DirectoryContactSettingsPanel({ schoolId, cellphone, principalPublicEmail }: { schoolId: string; cellphone: string; principalPublicEmail: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveSchoolDirectoryContact, initialState);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      router.refresh();
      queueMicrotask(() => setOpen(false));
    } else {
      toast.error(state.message);
    }
  }, [state, router]);
  const cellphoneError = state.fieldErrors?.cellphone?.[0];
  const emailError = state.fieldErrors?.principalPublicEmail?.[0];

  return (
    <ConfigurationCard
      icon={ContactRound}
      title="School Directory contact"
      description="Public directory details visible to authenticated ScolaPro schools. Other school contact fields remain in their canonical settings."
      open={open}
      onToggle={() => setOpen((current) => !current)}
      panelId="school-directory-contact-editor"
      disabled={pending}
      summary={(
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Public cellphone</dt>
            <dd className="mt-1 break-words text-foreground">{cellphone || "Not configured"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Principal public email</dt>
            <dd className="mt-1 break-all text-foreground">{principalPublicEmail || "Not configured"}</dd>
          </div>
        </dl>
      )}
      editor={(
      <form action={action} className="grid gap-4 md:grid-cols-2" noValidate>
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
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4 md:col-span-2">
          <button type="button" disabled={pending} onClick={() => setOpen(false)} className="scolapro-cta min-h-10 bg-surface-muted px-4 text-sm font-medium hover:bg-surface-elevated disabled:opacity-60">Cancel</button>
          <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}{pending ? "Saving…" : "Save directory contact"}
          </button>
        </div>
      </form>
      )}
    />
  );
}
