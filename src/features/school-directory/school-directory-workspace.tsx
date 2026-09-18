"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Building2,
  CalendarDays,
  GraduationCap,
  Hash,
  LoaderCircle,
  MapPin,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { formFieldLabelClass } from "@/components/ui/form-field-layout";
import { Picker } from "@/components/ui/picker";
import {
  saveCircuitInspectorContact,
  type CircuitInspectorContactState,
} from "@/features/school-directory/server/actions";
import type {
  DirectoryCircuitOption,
  DirectoryRegionOption,
  DirectorySchoolRow,
  DirectoryViewerAuthority,
} from "@/features/school-directory/server/queries";

const initialState: CircuitInspectorContactState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";

const UNASSIGNED_GROUP = "Circuit not configured";

function textLine(label: string, value: string, Icon: typeof Phone) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0"><span className="text-muted-foreground">{label}: </span><span className="truncate font-medium">{value}</span></span>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function InspectorContactForm({ circuitId, initial, onSaved }: { circuitId: string; initial: { name: string; phone: string; email: string }; onSaved: () => void }) {
  const [state, action, pending] = useActionState(saveCircuitInspectorContact, initialState);
  const [open, setOpen] = useState(false);
  const finish = () => { setOpen(false); onSaved(); };
  const hasExisting = Boolean(initial.name || initial.phone || initial.email);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="scolapro-cta inline-flex min-h-8 items-center gap-1.5 bg-surface-muted px-2.5 text-xs font-medium hover:bg-surface-elevated">
        <Pencil aria-hidden="true" className="size-3" /> {hasExisting ? "Edit inspector contact" : "Add inspector contact"}
      </button>
    );
  }
  return (
    <form action={action} className="mt-2 grid gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-3 sm:grid-cols-3" noValidate>
      <input type="hidden" name="circuitId" value={circuitId} />
      <div>
        <label className={formFieldLabelClass} htmlFor={`inspector-name-${circuitId}`}>Inspector name</label>
        <input id={`inspector-name-${circuitId}`} name="inspectorName" defaultValue={initial.name} className={`${fieldClass} mt-1.5`} maxLength={160} />
      </div>
      <div>
        <label className={formFieldLabelClass} htmlFor={`inspector-phone-${circuitId}`}>Phone</label>
        <input id={`inspector-phone-${circuitId}`} name="inspectorPhone" defaultValue={initial.phone} className={`${fieldClass} mt-1.5`} maxLength={80} />
      </div>
      <div>
        <label className={formFieldLabelClass} htmlFor={`inspector-email-${circuitId}`}>Email</label>
        <input id={`inspector-email-${circuitId}`} name="inspectorEmail" type="email" defaultValue={initial.email} className={`${fieldClass} mt-1.5`} />
      </div>
      <div className="flex items-center gap-2 sm:col-span-3">
        <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-9 items-center gap-2 bg-brand px-3 text-xs font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
          {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Save className="size-3.5" aria-hidden="true" />} {pending ? "Saving…" : "Save inspector contact"}
        </button>
        <button type="button" onClick={finish} disabled={pending} className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-medium text-muted-foreground hover:bg-surface-muted disabled:opacity-60">
          <X aria-hidden="true" className="size-3.5" /> Cancel
        </button>
        {state.message ? <span className={state.success ? "text-xs text-[color:var(--success)]" : "text-xs text-[color:var(--danger)]"}>{state.message}</span> : null}
      </div>
    </form>
  );
}

function DirectorySchoolCard({ school }: { school: DirectorySchoolRow }) {
  const locationBits = [school.town, school.regionName || school.region].filter(Boolean);
  return (
    <article className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="scolapro-record-title text-base">{school.schoolName}</h3>
        {school.gradesOfferedDisplay ? <span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-surface-muted px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground"><GraduationCap aria-hidden="true" className="size-3" /> Grades {school.gradesOfferedDisplay}</span> : null}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {locationBits.length ? <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-3" />{locationBits.join(" · ")}</span> : null}
        {school.emisNumber ? <span className="inline-flex items-center gap-1"><Hash aria-hidden="true" className="size-3" />EMIS: {school.emisNumber}</span> : null}
      </p>
      <div className="mt-3 grid gap-1.5 md:grid-cols-2">
        {textLine("Telephone", school.telephone, Phone)}
        {textLine("Cellphone", school.schoolCellphone, Phone)}
        {textLine("Fax", school.fax, Phone)}
        {textLine("Email", school.schoolEmail, AtSign)}
        {textLine("Principal", school.principalName, UserRound)}
        {textLine("Principal public email", school.principalPublicEmail, AtSign)}
      </div>
      {school.physicalAddress || school.postalAddress ? (
        <div className="mt-3 border-t border-border-subtle pt-3 text-xs leading-5 text-muted-foreground">
          {school.physicalAddress ? <p><span className="font-medium text-foreground/80">Physical:</span> {school.physicalAddress}</p> : null}
          {school.postalAddress ? <p><span className="font-medium text-foreground/80">Postal:</span> {school.postalAddress}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

export function SchoolDirectoryWorkspace({
  schools,
  regions,
  circuits,
  authority,
  initialSearch,
}: {
  schools: DirectorySchoolRow[];
  regions: DirectoryRegionOption[];
  circuits: DirectoryCircuitOption[];
  authority: DirectoryViewerAuthority;
  initialSearch: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [regionId, setRegionId] = useState("");
  const [circuitId, setCircuitId] = useState("");
  const router = useRouter();

  const groups = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const filtered = schools.filter((school) => {
      if (regionId && school.regionId !== regionId) return false;
      if (circuitId && school.circuitId !== circuitId) return false;
      if (!needle) return true;
      return `${school.schoolName} ${school.emisNumber} ${school.town} ${school.region}`.toLocaleLowerCase().includes(needle);
    });
    const map = new Map<string, DirectorySchoolRow[]>();
    for (const school of filtered) {
      const key = school.circuitName || UNASSIGNED_GROUP;
      const list = map.get(key) ?? [];
      list.push(school);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [schools, search, regionId, circuitId]);

  const hasFilters = Boolean(search.trim() || regionId || circuitId);

  return (
    <section className="space-y-5">
      <header className="mb-6">
        <h1 className="scolapro-page-title text-[clamp(1.25rem,1.08rem+0.45vw,1.65rem)]">School Directory</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Find contact details for ScolaPro schools.</p>
      </header>

      <div className="grid gap-3 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <div>
          <label className={formFieldLabelClass} htmlFor="directory-search">Search</label>
          <input
            id="directory-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="School name or EMIS number"
            className={`${fieldClass} mt-1.5`}
          />
        </div>
        <Picker
          label="Region"
          value={regionId}
          onChange={(value) => { setRegionId(value); router.refresh(); }}
          placeholder={regionId ? regions.find((option) => option.value === regionId)?.label ?? "All regions" : "All regions"}
          options={regions}
        />
        <Picker
          label="Circuit"
          value={circuitId}
          onChange={(value) => { setCircuitId(value); router.refresh(); }}
          placeholder={circuitId ? circuits.find((option) => option.value === circuitId)?.label ?? "All circuits" : "All circuits"}
          options={circuits}
        />
        {hasFilters ? (
          <button
            type="button"
            onClick={() => { setSearch(""); setRegionId(""); setCircuitId(""); }}
            className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-1.5 bg-surface-muted px-3 text-sm font-medium hover:bg-surface-elevated"
          >
            <X aria-hidden="true" className="size-3.5" /> Clear filters
          </button>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border-subtle bg-surface-muted p-8 text-center">
          <Building2 aria-hidden="true" className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No schools match this search.</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a different name or EMIS number, or clear the filters.</p>
        </div>
      ) : (
        groups.map(([circuitName, groupSchools]) => {
          const first = groupSchools[0];
          const isConfigured = Boolean(first?.circuitId);
          const canEditCircuit = isConfigured
            && authority.canManageSchoolSettings
            && Boolean(first.circuitId && authority.editableCircuitIds.includes(first.circuitId));
          return (
            <section key={circuitName} aria-label={circuitName} className="space-y-3">
              <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="scolapro-section-title flex items-center gap-2 text-base">
                    {isConfigured ? <ShieldCheck aria-hidden="true" className="size-4 text-[color:var(--accent-mint)]" /> : null}
                    {circuitName}
                  </h2>
                  {isConfigured && canEditCircuit && first?.circuitId ? (
                    <InspectorContactForm
                      circuitId={first.circuitId}
                      initial={{ name: first.inspectorName, phone: first.inspectorPhone, email: first.inspectorEmail }}
                      onSaved={() => router.refresh()}
                    />
                  ) : null}
                </div>
                {isConfigured && (first?.inspectorName || first?.inspectorPhone || first?.inspectorEmail) ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {first?.inspectorName ? <span className="inline-flex items-center gap-1"><UserRound aria-hidden="true" className="size-3" />{first.inspectorName}</span> : null}
                    {first?.inspectorPhone ? <span className="inline-flex items-center gap-1"><Phone aria-hidden="true" className="size-3" />{first.inspectorPhone}</span> : null}
                    {first?.inspectorEmail ? <span className="inline-flex items-center gap-1"><AtSign aria-hidden="true" className="size-3" />{first.inspectorEmail}</span> : null}
                  </div>
                ) : null}
                {isConfigured && first?.inspectorLastUpdatedAt ? (
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">
                    Last updated by {first.inspectorLastUpdatedBySchoolName || "a circuit school"}, {formatDate(first.inspectorLastUpdatedAt)}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {groupSchools.map((school) => <DirectorySchoolCard key={school.schoolId} school={school} />)}
              </div>
            </section>
          );
        })
      )}

      <p className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
        <CalendarDays aria-hidden="true" className="size-3" />
        Directory details are published by each school for authenticated ScolaPro users. Operational records stay private to each school.
      </p>
    </section>
  );
}
