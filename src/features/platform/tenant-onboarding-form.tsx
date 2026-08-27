"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createTenantSchool,
  type TenantOnboardingState,
} from "@/features/platform/server/actions";

const initialState: TenantOnboardingState = {};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.[0]) return null;
  return <p className="mt-1 text-xs text-[color:var(--danger)]">{messages[0]}</p>;
}

export function TenantOnboardingForm() {
  const [state, action, pending] = useActionState(createTenantSchool, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      formRef.current?.reset();
      return;
    }
    toast.error(state.message);
  }, [state]);

  const fieldClass =
    "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tenantName" className="text-xs font-medium text-foreground">Tenant name</label>
          <input id="tenantName" name="tenantName" className={`${fieldClass} mt-1.5`} placeholder="Example Education Trust" />
          <FieldError messages={state.fieldErrors?.tenantName} />
        </div>
        <div>
          <label htmlFor="tenantSlug" className="text-xs font-medium text-foreground">Tenant slug</label>
          <input id="tenantSlug" name="tenantSlug" className={`${fieldClass} mt-1.5`} placeholder="example-education-trust" autoCapitalize="none" />
          <FieldError messages={state.fieldErrors?.tenantSlug} />
        </div>
      </div>

      <div>
        <label htmlFor="schoolName" className="text-xs font-medium text-foreground">First school</label>
        <input id="schoolName" name="schoolName" className={`${fieldClass} mt-1.5`} placeholder="Example Secondary School" />
        <FieldError messages={state.fieldErrors?.schoolName} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="emisNumber" className="text-xs font-medium text-foreground">EMIS number</label>
          <input id="emisNumber" name="emisNumber" className={`${fieldClass} mt-1.5`} placeholder="Optional" />
        </div>
        <div>
          <label htmlFor="region" className="text-xs font-medium text-foreground">Region</label>
          <input id="region" name="region" className={`${fieldClass} mt-1.5`} placeholder="Optional" />
        </div>
        <div>
          <label htmlFor="town" className="text-xs font-medium text-foreground">Town</label>
          <input id="town" name="town" className={`${fieldClass} mt-1.5`} placeholder="Optional" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border-subtle pt-4">
        <p className="max-w-lg text-xs leading-5 text-muted-foreground">
          Creates the tenant and its first school atomically. School administrators are invited separately so identity and role assignment remain governed.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="scolapro-cta inline-flex min-h-10 shrink-0 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-65"
        >
          {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
          {pending ? "Creating…" : "Create tenant"}
        </button>
      </div>
    </form>
  );
}