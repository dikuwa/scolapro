"use client";

import Link from "next/link";
import { ChevronRight, Mail, MapPin, Phone, Search, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { GuardianDirectoryRow } from "@/features/guardians/server/directory";

function normalized(value: string) { return value.trim().toLocaleLowerCase(); }
function phoneHref(value: string) { return `tel:${value.replace(/[^+\d]/g, "")}`; }

export function GuardianDirectory({ guardians }: { guardians: GuardianDirectoryRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = normalized(query);
    if (!needle) return guardians;
    return guardians.filter((guardian) => normalized([
      guardian.name,
      ...guardian.contacts.map((contact) => contact.value),
      ...guardian.learners.flatMap((learner) => [learner.name, learner.admissionNumber ?? "", learner.grade, learner.registerClass]),
    ].join(" ")).includes(needle));
  }, [guardians, query]);

  return <div className="space-y-4">
    <div className="rounded-[var(--radius-md)] bg-surface-muted/55 p-3">
      <label className="scolapro-control-surface flex min-h-10 w-full max-w-2xl items-center gap-2 rounded-[var(--radius-sm)] px-3">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">Search guardians</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guardian, phone, learner or admission number…" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
        {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear guardian search" className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted hover:text-foreground"><X className="size-3.5" /></button> : null}
      </label>
      <p className="mt-2 text-xs text-muted-foreground">{filtered.length} of {guardians.length} guardians shown</p>
    </div>

    {filtered.length ? <div className="grid gap-3 xl:grid-cols-2">{filtered.map((guardian) => {
      const primaryPhone = guardian.contacts.find((contact) => contact.primary && contact.type !== "email") ?? guardian.contacts.find((contact) => contact.type !== "email");
      const primaryEmail = guardian.contacts.find((contact) => contact.primary && contact.type === "email") ?? guardian.contacts.find((contact) => contact.type === "email");
      return <article key={guardian.id} className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3"><span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><UserRound aria-hidden="true" className="size-4" /></span><div className="min-w-0"><h2 className="scolapro-record-title truncate">{guardian.name}</h2><p className="mt-0.5 text-xs text-muted-foreground">{guardian.learners.length} linked {guardian.learners.length === 1 ? "learner" : "learners"}</p></div></div>
          <div className="flex shrink-0 gap-1">{primaryPhone ? <a href={phoneHref(primaryPhone.value)} aria-label={`Call ${guardian.name}`} className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-brand-soft hover:text-brand-strong"><Phone className="size-4" /></a> : null}{primaryEmail ? <a href={`mailto:${primaryEmail.value}`} aria-label={`Email ${guardian.name}`} className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-muted-foreground transition hover:bg-brand-soft hover:text-brand-strong"><Mail className="size-4" /></a> : null}</div>
        </div>

        <div className="mt-4 space-y-2 text-xs text-muted-foreground">
          {guardian.contacts.map((contact) => <div key={contact.id} className="flex items-center gap-2"><span className="w-16 shrink-0 capitalize">{contact.type}</span><span className="min-w-0 break-all text-foreground/85">{contact.value}</span>{contact.primary ? <span className="rounded-[var(--radius-xs)] bg-brand-soft px-1.5 py-0.5 text-[0.62rem] font-medium text-brand-strong">Primary</span> : null}</div>)}
          {guardian.address ? <div className="flex items-start gap-2 border-t border-border-subtle pt-2"><MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /><span className="leading-5">{guardian.address}</span></div> : null}
        </div>

        <div className="mt-4 border-t border-border-subtle pt-3"><div className="mb-2 flex items-center gap-2"><Users aria-hidden="true" className="size-3.5 text-brand" /><h3 className="text-xs font-semibold">Linked learners</h3></div><div className="space-y-1.5">{guardian.learners.map((learner) => <Link key={`${guardian.id}-${learner.id}-${learner.relationship}`} href={`/learners/${learner.id}`} className="group flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2 transition hover:bg-brand-soft">
          <span className="min-w-0"><span className="block truncate text-xs font-semibold">{learner.name}</span><span className="mt-0.5 block truncate text-[0.68rem] text-muted-foreground">{learner.admissionNumber ?? "No admission number"} · {learner.grade} · {learner.registerClass}</span><span className="mt-1 flex flex-wrap gap-1 text-[0.62rem] capitalize text-muted-foreground">{learner.relationship}{learner.primary ? <span>· Primary</span> : null}{learner.legalGuardian ? <span className="inline-flex items-center gap-0.5 text-[color:var(--success)]"><ShieldCheck className="size-3" />Legal</span> : null}{learner.emergencyContact ? <span className="text-[color:var(--warning)]">· Emergency</span> : null}</span></span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>)}</div></div>
      </article>;
    })}</div> : <div className="rounded-[var(--radius-md)] bg-surface px-5 py-12 text-center shadow-[var(--shadow-xs)]"><Users aria-hidden="true" className="mx-auto size-5 text-muted-foreground" /><h2 className="mt-3 text-sm font-semibold">No guardians match this search</h2><p className="mt-1 text-xs text-muted-foreground">Try a guardian name, phone number, learner name or admission number.</p></div>}
  </div>;
}
