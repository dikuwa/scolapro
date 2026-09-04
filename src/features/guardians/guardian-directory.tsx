"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Mail, MapPin, Phone, Search, Users, X } from "lucide-react";
import type { GuardianDirectoryLearner, GuardianDirectoryRow } from "@/features/guardians/server/directory";

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function ContactIcon({ type }: { type: string }) {
  if (type === "email") return <Mail className="size-3" />;
  return <Phone className="size-3" />;
}

function learnerPreview(learners: GuardianDirectoryLearner[]) {
  if (!learners.length) return null;
  const first = learners[0];
  const placement = [first.grade, first.registerClass].filter(Boolean).join(" · ");
  return `${first.name}${placement ? ` · ${placement}` : ""}${learners.length > 1 ? ` · +${learners.length - 1} more` : ""}`;
}

function LearnerDetail({ learner }: { learner: GuardianDirectoryLearner }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface px-3 py-2.5 shadow-[var(--shadow-xs)]">
      <p className="text-sm font-medium">{learner.name}</p>
      <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
        {learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {learner.isLegalGuardian ? <span className="rounded-[var(--radius-xs)] bg-success-soft px-2 py-0.5 text-[0.6rem] font-medium text-[color:var(--success)]">Legal</span> : null}
        {learner.isEmergencyContact ? <span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-0.5 text-[0.6rem] font-medium text-[color:var(--warning)]">Emergency</span> : null}
        {learner.isPickupAuthorized ? <span className="rounded-[var(--radius-xs)] bg-info-soft px-2 py-0.5 text-[0.6rem] font-medium text-[color:var(--info)]">Pickup</span> : null}
        <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-0.5 text-[0.6rem] font-medium capitalize text-muted-foreground">{learner.relationshipType}</span>
      </div>
    </div>
  );
}

function GuardianRow({ guardian, expanded, onToggle }: { guardian: GuardianDirectoryRow; expanded: boolean; onToggle: () => void }) {
  const phoneContact = guardian.contacts.find((contact) => contact.type === "mobile" || contact.type === "phone");
  const emailContact = guardian.contacts.find((contact) => contact.type === "email");
  const collapsedLearnerPreview = learnerPreview(guardian.learners);
  const hasEmergencyLearner = guardian.learners.some((learner) => learner.isEmergencyContact);

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className={`flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[color:var(--brand-soft)] sm:px-5 ${
          expanded ? "bg-surface-muted/45" : "bg-transparent hover:bg-surface-muted/70"
        }`}
        aria-expanded={expanded}
        aria-controls={`guardian-details-${guardian.guardianId}`}
      >
        <ChevronRight aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ${expanded ? "rotate-90 text-brand-strong" : ""}`} />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="scolapro-record-title shrink-0">{guardian.name}</span>
          {!expanded && collapsedLearnerPreview ? <span className="min-w-0 truncate text-[0.64rem] font-normal text-muted-foreground">· {collapsedLearnerPreview}</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {guardian.learners.length > 1 ? <span className="hidden rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.62rem] font-medium text-brand-strong sm:inline">{guardian.learners.length} learners</span> : null}
          {hasEmergencyLearner ? <span className="rounded-[var(--radius-xs)] bg-warning-soft px-2 py-1 text-[0.62rem] font-medium text-[color:var(--warning)]">Emergency</span> : null}
        </div>
      </button>

      {expanded ? (
        <div id={`guardian-details-${guardian.guardianId}`} className="border-t border-border-subtle bg-surface-muted/45 px-4 py-4 sm:px-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold text-foreground">Linked learners</h3>
              <div className="space-y-2">{guardian.learners.map((learner) => <LearnerDetail key={learner.learnerId} learner={learner} />)}</div>
            </div>

            <div className="space-y-4">
              {guardian.contacts.length ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-foreground">Contact details</h3>
                  <div className="space-y-1.5">{guardian.contacts.map((contact) => (
                    <div key={contact.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <ContactIcon type={contact.type} />
                      <span className="capitalize">{contact.label || contact.type}</span>
                      <span className="text-foreground">{contact.value}</span>
                      {contact.primary ? <span className="rounded-[var(--radius-xs)] bg-brand-soft px-1.5 py-0.5 text-[0.6rem] font-medium text-brand-strong">Primary</span> : null}
                    </div>
                  ))}</div>
                </div>
              ) : null}

              {guardian.addresses.length ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-foreground">Addresses</h3>
                  <div className="space-y-1.5">{guardian.addresses.map((address) => (
                    <div key={address.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 size-3 shrink-0" />
                      <span><span className="font-medium capitalize text-foreground/80">{address.label || address.type}: </span>{[address.line1, address.line2, address.locality, address.town, address.region, address.postalCode, address.country].filter(Boolean).join(", ")}</span>
                    </div>
                  ))}</div>
                </div>
              ) : null}

              {(phoneContact || emailContact) ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-foreground">Quick actions</h3>
                  <div className="flex flex-wrap gap-2">
                    {phoneContact ? <a href={`tel:${phoneContact.value}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-success-soft px-2.5 text-[0.7rem] font-semibold text-[color:var(--success)] transition hover:brightness-95"><Phone className="size-3.5" />Call</a> : null}
                    {emailContact ? <a href={`mailto:${emailContact.value}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-xs)] bg-brand-soft px-2.5 text-[0.7rem] font-semibold text-brand-strong transition hover:brightness-95"><Mail className="size-3.5" />Email</a> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function GuardianDirectory({ guardians }: { guardians: GuardianDirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const [learnerQuery, setLearnerQuery] = useState("");
  const [expandedGuardianId, setExpandedGuardianId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = normalized(query);
    const learnerNeedle = normalized(learnerQuery);
    return guardians.filter((guardian) => {
      const nameMatch = !needle || `${guardian.name} ${guardian.identityNumber ?? ""} ${guardian.contacts.map((contact) => contact.value).join(" ")}`.toLowerCase().includes(needle);
      const learnerMatch = !learnerNeedle || guardian.learners.some((learner) => `${learner.name} ${learner.admissionNumber ?? ""} ${learner.grade} ${learner.registerClass}`.toLowerCase().includes(learnerNeedle));
      return nameMatch && learnerMatch;
    });
  }, [guardians, query, learnerQuery]);

  const hasFilters = Boolean(query || learnerQuery);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-[var(--radius-md)] bg-surface-muted/55 p-3 lg:grid-cols-2 lg:items-center">
        <label className="scolapro-control-surface flex min-h-10 min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-3">
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guardian by name, phone, email…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" autoComplete="off" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><X className="size-3.5" /></button> : null}
        </label>
        <label className="scolapro-control-surface flex min-h-10 min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-3">
          <Users aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input value={learnerQuery} onChange={(event) => setLearnerQuery(event.target.value)} placeholder="Filter by learner name, admission number, grade…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70" autoComplete="off" />
          {learnerQuery ? <button type="button" onClick={() => setLearnerQuery("")} aria-label="Clear learner filter" className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><X className="size-3.5" /></button> : null}
        </label>
        {hasFilters ? <button type="button" onClick={() => { setQuery(""); setLearnerQuery(""); }} className="min-h-8 justify-self-start rounded-[var(--radius-xs)] px-2 text-[0.7rem] font-medium text-muted-foreground hover:bg-surface hover:text-foreground lg:col-start-2 lg:justify-self-end">Clear filters</button> : null}
      </div>

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-border-subtle bg-surface shadow-[var(--shadow-xs)]">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2"><Users aria-hidden="true" className="size-4 text-brand-strong" /><h2 className="scolapro-section-title">Guardians</h2></div>
          <span className="text-xs text-muted-foreground">{filtered.length} shown</span>
        </div>

        {filtered.length ? <div>{filtered.map((guardian) => <GuardianRow key={guardian.guardianId} guardian={guardian} expanded={expandedGuardianId === guardian.guardianId} onToggle={() => setExpandedGuardianId((current) => current === guardian.guardianId ? null : guardian.guardianId)} />)}</div> : (
          <div className="px-5 py-12 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-sm)] bg-surface-muted text-muted-foreground"><Users aria-hidden="true" className="size-5" /></span>
            <h3 className="mt-3 text-sm font-semibold">No guardians match these filters</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Try a shorter search or clear the filters.</p>
          </div>
        )}
      </section>
    </div>
  );
}
