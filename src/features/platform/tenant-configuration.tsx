"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Building2, LoaderCircle, MapPin, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { DateField } from "@/components/ui/date-field";
import { formFieldLabelClass } from "@/components/ui/form-field-layout";
import { Picker } from "@/components/ui/picker";
import {
  updatePlatformSchoolConfiguration,
  updatePlatformSchoolNetworkAssignment,
  updatePlatformTenantConfiguration,
  type PlatformConfigurationState,
} from "@/features/platform/server/actions";
import type {
  PlatformNetworkCircuitOption,
  PlatformNetworkRegionOption,
  PlatformSchoolSummary,
  PlatformTenantSummary,
} from "@/features/platform/server/tenants";

const initialState: PlatformConfigurationState = {};
const fieldClass =
  "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.[0] ? <p className="mt-1 text-xs text-[color:var(--danger)]">{messages[0]}</p> : null;
}

function useStateToast(state: PlatformConfigurationState) {
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

function TenantEditor({ tenant }: { tenant: PlatformTenantSummary }) {
  const [state, action, pending] = useActionState(updatePlatformTenantConfiguration, initialState);
  const [status, setStatus] = useState(tenant.status);
  useStateToast(state);

  return (
    <form action={action} className="grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end" noValidate>
      <input type="hidden" name="tenantId" value={tenant.id} />
      <div>
        <label className={formFieldLabelClass} htmlFor={`tenant-name-${tenant.id}`}>Tenant name</label>
        <input id={`tenant-name-${tenant.id}`} name="name" defaultValue={tenant.name} className={`${fieldClass} mt-1.5`} />
        <FieldError messages={state.fieldErrors?.name} />
        <p className="mt-1 text-[0.68rem] text-muted-foreground">Slug: {tenant.slug} · fixed identifier</p>
      </div>
      <div>
        <Picker
          label="Tenant status"
          name="status"
          value={status}
          onChange={setStatus}
          placeholder="Choose status"
          options={[
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <FieldError messages={state.fieldErrors?.status} />
      </div>
      <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
        {pending ? "Saving…" : "Save tenant"}
      </button>
    </form>
  );
}

function SchoolEditor({ tenantId, school }: { tenantId: string; school: PlatformSchoolSummary }) {
  const [state, action, pending] = useActionState(updatePlatformSchoolConfiguration, initialState);
  const [status, setStatus] = useState(school.status);
  useStateToast(state);

  return (
    <form action={action} className="mt-3 grid gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3 sm:grid-cols-2 lg:grid-cols-3" noValidate>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="schoolId" value={school.id} />
      <div>
        <label className={formFieldLabelClass} htmlFor={`school-name-${school.id}`}>School name</label>
        <input id={`school-name-${school.id}`} name="name" defaultValue={school.name} className={`${fieldClass} mt-1.5`} />
        <FieldError messages={state.fieldErrors?.name} />
      </div>
      <div>
        <label className={formFieldLabelClass} htmlFor={`emis-${school.id}`}>EMIS number</label>
        <input id={`emis-${school.id}`} name="emisNumber" defaultValue={school.emisNumber ?? ""} className={`${fieldClass} mt-1.5`} />
      </div>
      <Picker
        label="School status"
        name="status"
        value={status}
        onChange={setStatus}
        placeholder="Choose status"
        options={[
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
          { value: "archived", label: "Archived" },
        ]}
      />
      <div>
        <label className={formFieldLabelClass} htmlFor={`town-${school.id}`}>Town</label>
        <input id={`town-${school.id}`} name="town" defaultValue={school.town ?? ""} className={`${fieldClass} mt-1.5`} />
      </div>
      <div>
        <label className={formFieldLabelClass} htmlFor={`region-text-${school.id}`}>Region text</label>
        <input id={`region-text-${school.id}`} name="region" defaultValue={school.region ?? ""} className={`${fieldClass} mt-1.5`} />
        <p className="mt-1 text-[0.68rem] text-muted-foreground">Legacy display text; canonical network region is managed below.</p>
      </div>
      <div>
        <label className={formFieldLabelClass} htmlFor={`telephone-${school.id}`}>Telephone</label>
        <input id={`telephone-${school.id}`} name="telephone" defaultValue={school.telephone} className={`${fieldClass} mt-1.5`} />
      </div>
      <div>
        <label className={formFieldLabelClass} htmlFor={`cellphone-${school.id}`}>Cellphone</label>
        <input id={`cellphone-${school.id}`} name="cellphone" defaultValue={school.cellphone} className={`${fieldClass} mt-1.5`} />
      </div>
      <div>
        <label className={formFieldLabelClass} htmlFor={`fax-${school.id}`}>Fax</label>
        <input id={`fax-${school.id}`} name="fax" defaultValue={school.fax} className={`${fieldClass} mt-1.5`} />
      </div>
      <div>
        <label className={formFieldLabelClass} htmlFor={`email-${school.id}`}>School email</label>
        <input id={`email-${school.id}`} name="email" type="email" defaultValue={school.schoolEmail} className={`${fieldClass} mt-1.5`} />
        <FieldError messages={state.fieldErrors?.email} />
      </div>
      <div className="sm:col-span-2">
        <label className={formFieldLabelClass} htmlFor={`physical-${school.id}`}>Physical address</label>
        <input id={`physical-${school.id}`} name="physicalAddress" defaultValue={school.physicalAddress} className={`${fieldClass} mt-1.5`} />
      </div>
      <div>
        <label className={formFieldLabelClass} htmlFor={`postal-${school.id}`}>Postal address</label>
        <input id={`postal-${school.id}`} name="postalAddress" defaultValue={school.postalAddress} className={`${fieldClass} mt-1.5`} />
      </div>
      <div className="flex justify-start border-t border-border-subtle pt-3 sm:col-span-2 lg:col-span-3">
        <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          {pending ? "Saving…" : "Save school"}
        </button>
      </div>
    </form>
  );
}

function NetworkAssignmentEditor({
  tenantId,
  school,
  regions,
  circuits,
  today,
}: {
  tenantId: string;
  school: PlatformSchoolSummary;
  regions: PlatformNetworkRegionOption[];
  circuits: PlatformNetworkCircuitOption[];
  today: string;
}) {
  const [state, action, pending] = useActionState(updatePlatformSchoolNetworkAssignment, initialState);
  const [regionId, setRegionId] = useState(school.networkRegionId ?? "");
  const [circuitId, setCircuitId] = useState(school.circuitId ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  useStateToast(state);

  const availableCircuits = useMemo(
    () => circuits.filter((circuit) => !regionId || circuit.regionId === regionId),
    [circuits, regionId],
  );

  function changeRegion(value: string) {
    setRegionId(value);
    if (!circuits.some((circuit) => circuit.value === circuitId && circuit.regionId === value)) setCircuitId("");
  }

  return (
    <form action={action} className="mt-3 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 md:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_12rem_auto] lg:items-end" noValidate>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="schoolId" value={school.id} />
      <Picker
        label="Canonical region"
        name="regionId"
        value={regionId}
        onChange={changeRegion}
        searchable
        searchPlaceholder="Search regions"
        placeholder="Choose region"
        options={regions}
      />
      <Picker
        label="Circuit"
        name="circuitId"
        value={circuitId}
        onChange={setCircuitId}
        searchable
        searchPlaceholder="Search circuits"
        placeholder={regionId ? "Choose circuit" : "Choose region first"}
        disabled={!regionId}
        options={availableCircuits}
      />
      <DateField label="Effective from" name="effectiveFrom" value={effectiveFrom} onChange={setEffectiveFrom} required min={today} />
      <button type="submit" disabled={pending || !regionId || !circuitId || !effectiveFrom} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <MapPin className="size-4" aria-hidden="true" />}
        {pending ? "Saving…" : "Save assignment"}
      </button>
      <div className="md:col-span-3 lg:col-span-4">
        <p className="text-[0.68rem] leading-5 text-muted-foreground">
          Current: {school.networkRegionName && school.circuitName ? `${school.networkRegionName} · ${school.circuitName}` : "Circuit not configured"}.
          Changing this closes the prior effective assignment; it does not delete history. Inspector contact remains managed by authorized schools.
        </p>
        <FieldError messages={state.fieldErrors?.regionId} />
        <FieldError messages={state.fieldErrors?.circuitId} />
        <FieldError messages={state.fieldErrors?.effectiveFrom} />
      </div>
    </form>
  );
}

function SchoolConfiguration({
  tenantId,
  school,
  regions,
  circuits,
  today,
}: {
  tenantId: string;
  school: PlatformSchoolSummary;
  regions: PlatformNetworkRegionOption[];
  circuits: PlatformNetworkCircuitOption[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{school.name}</p>
          <p className="mt-1 text-[0.68rem] text-muted-foreground">
            {school.emisNumber ? `EMIS ${school.emisNumber}` : "EMIS number not set"} · {[school.town, school.region].filter(Boolean).join(" · ") || "Location not set"}
          </p>
          <p className="mt-1 text-[0.68rem] text-muted-foreground">
            Network: {school.networkRegionName && school.circuitName ? `${school.networkRegionName} · ${school.circuitName}` : "Circuit not configured"}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="scolapro-cta inline-flex min-h-9 shrink-0 items-center gap-1.5 bg-surface px-3 text-xs font-medium shadow-[var(--shadow-xs)] hover:bg-surface-elevated">
          {open ? <X className="size-3.5" aria-hidden="true" /> : <Pencil className="size-3.5" aria-hidden="true" />}
          {open ? "Close" : "Edit configuration"}
        </button>
      </div>
      {open ? (
        <>
          <SchoolEditor tenantId={tenantId} school={school} />
          <NetworkAssignmentEditor tenantId={tenantId} school={school} regions={regions} circuits={circuits} today={today} />
        </>
      ) : null}
    </article>
  );
}

export function PlatformTenantConfiguration({
  tenants,
  regions,
  circuits,
  today,
}: {
  tenants: PlatformTenantSummary[];
  regions: PlatformNetworkRegionOption[];
  circuits: PlatformNetworkCircuitOption[];
  today: string;
}) {
  if (!tenants.length) {
    return <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-8 text-center"><p className="text-sm font-medium">No tenants yet</p><p className="mt-1 text-xs text-muted-foreground">Use the onboarding form to create the first tenant and school.</p></div>;
  }

  return (
    <div className="space-y-5">
      {tenants.map((tenant) => (
        <section key={tenant.id} className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]">
          <div className="mb-3 flex items-center gap-2">
            <span className="scolapro-tone-brand grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]"><Building2 className="size-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h3 className="scolapro-record-title">{tenant.name}</h3>
              <p className="text-[0.68rem] text-muted-foreground">{tenant.schools.length} {tenant.schools.length === 1 ? "school" : "schools"} · {tenant.slug}</p>
            </div>
          </div>
          <TenantEditor tenant={tenant} />
          <div className="mt-3 grid gap-2">
            {tenant.schools.map((school) => (
              <SchoolConfiguration key={school.id} tenantId={tenant.id} school={school} regions={regions} circuits={circuits} today={today} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
