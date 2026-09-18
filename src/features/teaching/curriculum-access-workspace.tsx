"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  FileSearch,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Picker } from "@/components/ui/picker";
import type {
  CurriculumAccessAllocation,
  CurriculumAccessData,
  CurriculumAccessUnit,
  CurriculumAccessVersion,
} from "@/features/teaching/server/curriculum-access";

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function allocationLabel(allocation: CurriculumAccessAllocation) {
  return `${allocation.subjectName} · ${allocation.className}`;
}

function unitMatches(unit: CurriculumAccessUnit, query: string) {
  if (!query) return true;
  const haystack = [
    unit.unitCode,
    unit.theme ?? "",
    unit.topic,
    unit.assessmentGuidance ?? "",
    ...unit.objectives.flatMap((item) => [item.code ?? "", item.text]),
    ...unit.competencies.flatMap((item) => [item.code ?? "", item.text]),
  ]
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-6 text-center">
      <CircleAlert className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-2 text-sm font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{description}</p>
    </section>
  );
}

function RegistryMetadata({
  allocation,
  version,
}: {
  allocation: CurriculumAccessAllocation;
  version: CurriculumAccessVersion;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpenText className="size-4 text-brand-strong" aria-hidden="true" />
          <h2 className="scolapro-section-title">Registry metadata</h2>
          <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-0.5 text-[0.68rem] font-medium text-brand-strong">
            Read-only
          </span>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Allocated subject</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{allocation.subjectName}</dd>
          </div>
          <div>
            <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Grade / class</dt>
            <dd className="mt-1 text-sm text-foreground">{allocation.gradeName} · {allocation.className}</dd>
          </div>
          <div>
            <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Registry subject</dt>
            <dd className="mt-1 text-sm text-foreground">{version.registrySubjectName}</dd>
          </div>
          <div>
            <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Version</dt>
            <dd className="mt-1 text-sm text-foreground">{version.versionKey}</dd>
          </div>
          <div>
            <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Effective years</dt>
            <dd className="mt-1 text-sm text-foreground">
              {version.effectiveFromYear}{version.effectiveToYear ? `–${version.effectiveToYear}` : " onward"}
            </dd>
          </div>
          <div>
            <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Registry state</dt>
            <dd className="mt-1 text-sm text-foreground">{statusLabel(version.status)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          This page reads the canonical registry linked to your current governed allocation. It does not edit curriculum content.
        </p>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-4 text-brand-strong" aria-hidden="true" />
          <h2 className="scolapro-section-title">Source provenance</h2>
        </div>
        {version.source ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Source record</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{version.source.title}</dd>
            </div>
            <div>
              <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Authority</dt>
              <dd className="mt-1 text-sm text-foreground">{version.source.authority}</dd>
            </div>
            <div>
              <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Source state</dt>
              <dd className="mt-1 text-sm text-foreground">{statusLabel(version.source.status)}</dd>
            </div>
            <div>
              <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Document date</dt>
              <dd className="mt-1 text-sm text-foreground">{formatDate(version.source.sourceDocumentDate)}</dd>
            </div>
            <div>
              <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Source key</dt>
              <dd className="mt-1 break-all text-sm text-foreground">{version.source.sourceKey}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Provenance evidence</dt>
              <dd className="mt-1 text-sm text-foreground">
                {version.source.provenancePresent || version.source.checksumPresent
                  ? "Recorded in the canonical source record."
                  : "No additional provenance fields are loaded yet."}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted p-4">
            <p className="text-sm font-medium text-foreground">No source record linked</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Registry metadata exists, but source provenance has not been linked in the canonical model.
            </p>
          </div>
        )}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Linked curriculum files are not exposed directly from registry metadata. Governed document/storage access remains the source of truth for protected files.
        </p>
      </section>
    </div>
  );
}

function UnitCard({
  unit,
  allocation,
}: {
  unit: CurriculumAccessUnit;
  allocation: CurriculumAccessAllocation;
}) {
  const planningHref = `/teaching?allocation=${encodeURIComponent(allocation.allocationId)}&unit=${encodeURIComponent(unit.id)}`;
  const preparationHref = `/teaching/preparation?allocation=${encodeURIComponent(allocation.allocationId)}&unit=${encodeURIComponent(unit.id)}`;

  return (
    <article className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground">
              {unit.unitCode}
            </span>
            {unit.practicalRequired ? (
              <span className="scolapro-tone-amber rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.68rem] font-medium">
                Practical indicated
              </span>
            ) : null}
          </div>
          <h3 className="scolapro-record-title mt-2">{unit.topic}</h3>
          {unit.theme ? <p className="mt-1 text-xs text-muted-foreground">{unit.theme}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={planningHref}
            className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-xs font-medium text-foreground hover:bg-surface-muted"
          >
            Planning
            <ExternalLink className="scolapro-cta-icon size-3.5" aria-hidden="true" />
          </Link>
          <Link
            href={preparationHref}
            className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong"
          >
            Preparation
            <ClipboardCheck className="scolapro-cta-icon size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <h4 className="text-xs font-semibold text-foreground">Objectives</h4>
          {unit.objectives.length ? (
            <ul className="mt-2 space-y-2">
              {unit.objectives.map((objective, index) => (
                <li key={`${unit.id}-objective-${objective.code ?? index}`} className="text-sm leading-5 text-foreground">
                  {objective.code ? <span className="mr-1.5 font-medium text-muted-foreground">{objective.code}</span> : null}
                  {objective.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No objectives loaded for this topic yet.</p>
          )}
        </section>
        <section>
          <h4 className="text-xs font-semibold text-foreground">Competencies</h4>
          {unit.competencies.length ? (
            <ul className="mt-2 space-y-2">
              {unit.competencies.map((competency, index) => (
                <li key={`${unit.id}-competency-${competency.code ?? index}`} className="text-sm leading-5 text-foreground">
                  {competency.code ? <span className="mr-1.5 font-medium text-muted-foreground">{competency.code}</span> : null}
                  {competency.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No competencies loaded for this topic yet.</p>
          )}
        </section>
      </div>

      {unit.assessmentGuidance ? (
        <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">
          <p className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">Registry assessment guidance</p>
          <p className="mt-1 text-xs leading-5 text-foreground">{unit.assessmentGuidance}</p>
        </div>
      ) : null}
    </article>
  );
}

export function CurriculumAccessWorkspace({ data }: { data: CurriculumAccessData }) {
  const [allocationId, setAllocationId] = useState(data.allocations[0]?.allocationId ?? "");
  const [search, setSearch] = useState("");

  const allocation =
    data.allocations.find((item) => item.allocationId === allocationId) ??
    data.allocations[0] ??
    null;
  const version = allocation?.curriculumVersionId
    ? data.versionsById[allocation.curriculumVersionId] ?? null
    : null;
  const units = allocation?.curriculumVersionId
    ? data.unitsByVersionId[allocation.curriculumVersionId] ?? []
    : [];

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredUnits = useMemo(
    () => units.filter((unit) => unitMatches(unit, normalizedSearch)),
    [units, normalizedSearch],
  );

  return (
    <div className="space-y-5">
      <Link
        href="/teaching"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Teaching
      </Link>

      <div>
        <h1 className="scolapro-page-title">Curriculum & syllabus registry</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          Search the canonical curriculum content already linked to your current governed teaching allocations. Registry content is read-only here.
        </p>
      </div>

      {!data.allocations.length ? (
        <EmptyState
          title="No current governed teaching allocations"
          description="Curriculum access follows your current school, effective staff placement and active teacher allocations. No subject/grade allocation is available for this academic year."
        />
      ) : (
        <>
          <section aria-label="Curriculum filters" className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <Picker
                label="Subject & class"
                ariaLabel="Choose allocated subject and class"
                value={allocation?.allocationId ?? ""}
                onChange={(value) => {
                  setAllocationId(value);
                  setSearch("");
                }}
                searchable
                searchPlaceholder="Search your allocations…"
                options={data.allocations.map((item) => ({
                  value: item.allocationId,
                  label: allocationLabel(item),
                  helper: item.gradeName,
                }))}
                placeholder="Choose an allocation"
              />
              <div>
                <label htmlFor="curriculum-search" className="block h-4 text-xs font-medium leading-4">
                  Search curriculum
                </label>
                <div className="relative mt-1.5">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="curriculum-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search topic, objective or competency…"
                    className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated pl-9 pr-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition placeholder:text-muted-foreground/70 focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]"
                  />
                </div>
              </div>
            </div>
          </section>

          {allocation && !allocation.curriculumVersionId ? (
            <EmptyState
              title="Curriculum not linked to this allocation"
              description="The subject/grade allocation is valid, but no canonical curriculum version is linked to its subject offering yet. No curriculum content is inferred or fabricated."
            />
          ) : allocation && allocation.curriculumVersionId && !version ? (
            <EmptyState
              title="Curriculum registry entry not available"
              description="A curriculum version is linked to this allocation, but no teacher-readable approved/published registry entry is available. The page does not expose draft or ungoverned content."
            />
          ) : version && allocation ? (
            <>
              <RegistryMetadata allocation={allocation} version={version} />

              <section>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="scolapro-section-title">Topics, objectives & competencies</h2>
                    <p className="scolapro-section-description">
                      {units.length
                        ? `${filteredUnits.length} of ${units.length} curriculum topics shown.`
                        : "Registry metadata is linked, but structured curriculum content has not been loaded yet."}
                    </p>
                  </div>
                  {normalizedSearch ? (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="min-h-9 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-muted"
                    >
                      Clear search
                    </button>
                  ) : null}
                </div>

                {!units.length ? (
                  <div className="mt-4">
                    <EmptyState
                      title="Structured curriculum content not yet loaded"
                      description="The registry version and its provenance are available, but topics, objectives or competencies have not yet been structured in the canonical registry."
                    />
                  </div>
                ) : !filteredUnits.length ? (
                  <div className="mt-4">
                    <EmptyState
                      title="No curriculum matches this search"
                      description="Try another topic, objective, competency or code. The search only covers curriculum content within your selected governed allocation."
                    />
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4">
                    {filteredUnits.map((unit) => (
                      <UnitCard key={unit.id} unit={unit} allocation={allocation} />
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </>
      )}

      <section className="flex items-start gap-3 rounded-[var(--radius-md)] bg-surface-muted p-4">
        <span className="scolapro-tone-sky grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
          <FileSearch className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Source gate preserved</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Missing curriculum is shown as missing. ScolaPro does not scrape, invent, upload or relabel NIED content from this teacher surface.
          </p>
        </div>
      </section>
    </div>
  );
}
