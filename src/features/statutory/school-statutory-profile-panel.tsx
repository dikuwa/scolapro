"use client";

import { useActionState, useEffect, useState } from "react";
import { Database, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formFieldLabelClass } from "@/components/ui/form-field-layout";
import { ConfigurationCard } from "@/components/ui/configuration-card";
import {
  saveSchoolStatutoryEmisProfile,
  type SchoolStatutoryProfileState,
} from "@/features/statutory/server/school-profile-actions";
import type { SchoolStatutoryEmisProfile } from "@/features/statutory/server/school-profile";

const initialState: SchoolStatutoryProfileState = {};
const fieldClass =
  "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

function ReadOnlyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted px-3 py-2.5">
      <p className="text-[0.68rem] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value || "Not set"}</p>
    </div>
  );
}

function Toggle({
  name,
  defaultChecked,
  label,
  description,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-[color:var(--brand)]" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export function SchoolStatutoryEmisProfilePanel({
  schoolId,
  data,
}: {
  schoolId: string;
  data: SchoolStatutoryEmisProfile;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveSchoolStatutoryEmisProfile, initialState);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      router.refresh();
      queueMicrotask(() => {
        setOpen(false);
        document.querySelector<HTMLButtonElement>('[aria-controls="school-statutory-profile-editor"]')?.focus();
      });
    } else {
      toast.error(state.message);
    }
  }, [state, router]);

  const profile = data.profile;
  const address = [data.contact.physicalAddress, data.contact.postalAddress].filter(Boolean).join(" · ");
  const contact = [data.contact.telephone, data.contact.cellphone, data.contact.email].filter(Boolean).join(" · ");
  const hostel = data.hostel.configured
    ? `${data.hostel.activeCount} active · ${data.hostel.types.join(", ") || "Configured"}`
    : "Not configured";

  return (
    <ConfigurationCard
      icon={Database}
      tone="scolapro-tone-amber"
      title="Statutory / EMIS Profile"
      description="Reusable school facts for future statutory reporting. Canonical EMIS, education-network, contact/address and hostel records stay in their existing sources."
      open={open}
      onToggle={() => setOpen((current) => !current)}
      panelId="school-statutory-profile-editor"
      disabled={pending}
      className="mt-6"
      summary={(
        <>
          <div>
        <div className="mb-3 flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold">Canonical sources</h3>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              These are read here, not copied into an AEC profile. Update them through their owning school/network settings.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ReadOnlyFact label="EMIS number" value={data.school.emisNumber} />
          <ReadOnlyFact label="Town" value={data.school.town} />
          <ReadOnlyFact label="Region" value={data.network.regionName} />
          <ReadOnlyFact label="Circuit" value={data.network.circuitName} />
          <ReadOnlyFact label="Cluster" value={data.network.clusterName} />
          <ReadOnlyFact label="Hostel profile" value={hostel} />
          <div className="sm:col-span-2 xl:col-span-3">
            <ReadOnlyFact label="Canonical address" value={address} />
          </div>
          <div className="sm:col-span-2 xl:col-span-3">
            <ReadOnlyFact label="Canonical contact" value={contact} />
          </div>
        </div>
      </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
            {([
              ["Pay point", profile.payPoint],
              ["Constituency", profile.constituency],
              ["School classification", profile.schoolClassification],
              ["Ownership", profile.ownership],
              ["Urban / rural", profile.urbanRural],
              ["Satellite school information", profile.satelliteSchoolInformation],
            ] as const).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words font-medium text-foreground">{value || "Not configured"}</dd>
              </div>
            ))}
            <div><dt className="text-xs font-medium text-muted-foreground">Satellite school</dt><dd className="mt-1 font-medium">{profile.isSatelliteSchool ? "Yes" : "No"}</dd></div>
            <div><dt className="text-xs font-medium text-muted-foreground">Cluster centre</dt><dd className="mt-1 font-medium">{profile.isClusterCentre ? "Yes" : "No"}</dd></div>
          </dl>
        </>
      )}
      editor={(
        <form action={action} noValidate>
        <input type="hidden" name="schoolId" value={schoolId} />
        <div>
          <h3 className="text-sm font-semibold">Reusable statutory profile</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Enter the school&apos;s known descriptive values. Do not enter invented Ministry codes; official code mapping is owned by the statutory code registry.
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className={formFieldLabelClass} htmlFor="statutory-pay-point">Pay point</label>
            <input id="statutory-pay-point" name="payPoint" defaultValue={profile.payPoint} maxLength={120} className={`${fieldClass} mt-1.5`} />
            {state.fieldErrors?.payPoint?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{state.fieldErrors.payPoint[0]}</p> : null}
          </div>
          <div>
            <label className={formFieldLabelClass} htmlFor="statutory-constituency">Constituency</label>
            <input id="statutory-constituency" name="constituency" defaultValue={profile.constituency} maxLength={120} className={`${fieldClass} mt-1.5`} />
            {state.fieldErrors?.constituency?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{state.fieldErrors.constituency[0]}</p> : null}
          </div>
          <div>
            <label className={formFieldLabelClass} htmlFor="statutory-classification">School classification</label>
            <input id="statutory-classification" name="schoolClassification" defaultValue={profile.schoolClassification} maxLength={120} className={`${fieldClass} mt-1.5`} />
            <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">Human-readable value only; no statutory code is invented here.</p>
          </div>
          <div>
            <label className={formFieldLabelClass} htmlFor="statutory-ownership">Ownership</label>
            <input id="statutory-ownership" name="ownership" defaultValue={profile.ownership} maxLength={120} className={`${fieldClass} mt-1.5`} />
          </div>
          <div>
            <label className={formFieldLabelClass} htmlFor="statutory-urban-rural">Urban / rural</label>
            <input id="statutory-urban-rural" name="urbanRural" defaultValue={profile.urbanRural} maxLength={80} className={`${fieldClass} mt-1.5`} />
          </div>
          <div className="md:col-span-2 xl:col-span-1">
            <label className={formFieldLabelClass} htmlFor="statutory-satellite-info">Satellite school information</label>
            <input id="statutory-satellite-info" name="satelliteSchoolInformation" defaultValue={profile.satelliteSchoolInformation} maxLength={240} className={`${fieldClass} mt-1.5`} placeholder="Optional descriptive reference" />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Toggle name="isSatelliteSchool" defaultChecked={profile.isSatelliteSchool} label="Satellite school" description="Marks the school as a satellite where that is an established school fact." />
          <Toggle name="isClusterCentre" defaultChecked={profile.isClusterCentre} label="Cluster centre" description="Marks the school as the cluster centre without duplicating the canonical cluster assignment." />
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
          <button type="button" disabled={pending} onClick={() => {
            setOpen(false);
            document.querySelector<HTMLButtonElement>('[aria-controls="school-statutory-profile-editor"]')?.focus();
          }} className="scolapro-cta min-h-10 bg-surface-muted px-4 text-sm font-medium hover:bg-surface-elevated disabled:opacity-60">Cancel</button>
          <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
            {pending ? "Saving…" : "Save Statutory / EMIS Profile"}
          </button>
        </div>
        </form>
      )}
    />
  );
}
