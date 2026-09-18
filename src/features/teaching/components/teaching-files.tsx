"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, CircleAlert, FileDown, FolderOpen, Info, ListChecks, Printer, Search, ShieldCheck } from "lucide-react";
import { Picker } from "@/components/ui/picker";

// Teacher professional-files hub.
//
// This view AGGREGATES existing governed foundations. It does not own storage:
//   * "Official documents" are produced on demand by the existing official
//     document endpoint from the school's document identity; nothing is copied.
//   * "Connected teaching records" are the teacher's own canonical
//     lesson-preparation records. They are structured teaching records and are
//     never presented as uploaded files.
// Nothing here claims an official teacher-file taxonomy. Until authoritative
// source material exists, unclassified material stays explicitly "Uncategorised".

type Allocation = {
  allocationId: string;
  className: string | null;
  gradeName: string;
  subjectName: string;
  activeFrom: string;
  activeTo: string | null;
};

type OfficialDocument = {
  id: string;
  grade: string;
  registerClass: string;
  academicYear: number;
  subjectNames: string[];
  printHref: string;
  pdfHref: string;
};

type PreparationRecord = {
  id: string;
  allocationId: string;
  plannedOn: string;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export type TeachingFilesHubProps = {
  today: string;
  academicYear: number;
  allocations: Allocation[];
  officialDocuments: OfficialDocument[];
  preparationRecords: PreparationRecord[];
  /** False while the official teacher-file taxonomy has no verified source. */
  taxonomySourced?: boolean;
};

const preparationStatusLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  reviewed: "Reviewed",
  returned: "Returned",
};

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function statusTone(status: string) {
  if (status === "reviewed") return "bg-success-soft text-[color:var(--success)]";
  if (status === "submitted") return "bg-brand-soft text-brand-strong";
  return "bg-surface-muted text-muted-foreground";
}

function EmptyState({ title, description, hint }: { title: string; description: string; hint?: string }) {
  return (
    <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-6 text-center">
      <CircleAlert className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof FolderOpen }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        <p className="text-[0.68rem] font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function TeachingFilesHub(props: TeachingFilesHubProps) {
  const { allocations, officialDocuments, preparationRecords, academicYear, taxonomySourced = false } = props;

  const [query, setQuery] = useState("");
  const [allocationId, setAllocationId] = useState("");
  const [itemType, setItemType] = useState("");
  const [recordStatus, setRecordStatus] = useState("");

  const allocationById = useMemo(
    () => new Map(allocations.map((allocation) => [allocation.allocationId, allocation])),
    [allocations],
  );

  // Only the teacher's own effective allocations exist in this model, so every
  // filter operates on owned work and can never reach another teacher's files.
  const scopedAllocationIds = useMemo(
    () => new Set(allocations.map((a) => a.allocationId)),
    [allocations],
  );

  const normalized = query.trim().toLocaleLowerCase();

  const visibleDocuments = useMemo(() => {
    if (itemType === "records") return [];
    return officialDocuments.filter((document) => {
      if (allocationId) {
        const selected = allocationById.get(allocationId);
        if (!selected || selected.gradeName !== document.grade || selected.className !== document.registerClass) return false;
      }
      if (!normalized) return true;
      return [
        document.grade,
        document.registerClass,
        String(document.academicYear),
        "official class list",
        ...document.subjectNames,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [allocationId, allocationById, itemType, normalized, officialDocuments]);

  const visibleRecords = useMemo(() => {
    if (itemType === "official") return [];
    return preparationRecords.filter((record) => {
      if (!scopedAllocationIds.has(record.allocationId)) return false;
      if (allocationId && record.allocationId !== allocationId) return false;
      if (recordStatus && record.status !== recordStatus) return false;
      if (!normalized) return true;
      const allocation = allocationById.get(record.allocationId);
      return [
        allocation?.subjectName ?? "",
        allocation?.className ?? "",
        allocation?.gradeName ?? "",
        "lesson preparation",
        preparationStatusLabels[record.status] ?? record.status,
        record.plannedOn,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [allocationById, allocationId, itemType, normalized, preparationRecords, recordStatus, scopedAllocationIds]);

  const recordsByAllocation = useMemo(() => {
    const grouped = new Map<string, PreparationRecord[]>();
    for (const record of visibleRecords) {
      grouped.set(record.allocationId, [...(grouped.get(record.allocationId) ?? []), record]);
    }
    return [...grouped.entries()];
  }, [visibleRecords]);

  const allocationOptions = [
    { value: "", label: "All subjects & classes" },
    ...allocations.map((allocation) => ({
      value: allocation.allocationId,
      label: `${allocation.subjectName} · ${allocation.className ?? "Unassigned class"}`,
      helper: `${allocation.gradeName} · ${academicYear}`,
    })),
  ];

  if (!allocations.length) {
    return (
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Professional files</h2>
        <p className="scolapro-section-description">
          Documents and records connected to your governed teaching allocations for {academicYear}.
        </p>
        <EmptyState
          title="No effective teaching allocations"
          description={`No subject and class allocation is active for you in ${academicYear}, so there is nothing to aggregate yet.`}
          hint="Allocations are owned by the timetable and allocation register; academic leadership or the department maintains them."
        />
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Professional files</h2>
        <p className="scolapro-section-description">
          Everything below is derived from your own effective allocations for {academicYear}. No separate teaching-file store exists:
          official documents are produced by the shared document foundation and preparation records stay in the canonical teaching plan.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="My allocations" value={allocations.length} icon={FolderOpen} />
          <Stat label="Official documents" value={officialDocuments.length} icon={ShieldCheck} />
          <Stat label="Teaching records" value={preparationRecords.length} icon={ListChecks} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block text-xs font-medium leading-4 sm:col-span-2 xl:col-span-1">
            Search files
            <span className="relative mt-1.5 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Subject, class, grade, status…"
                className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated pl-9 pr-3 text-sm outline-none transition focus:ring-4 focus:ring-[color:var(--brand-soft)]"
              />
            </span>
          </label>
          <Picker
            label="Subject & class"
            value={allocationId}
            onChange={setAllocationId}
            searchable
            options={allocationOptions}
            placeholder="All subjects & classes"
          />
          <Picker
            label="List"
            value={itemType}
            onChange={setItemType}
            options={[
              { value: "", label: "Official documents and records" },
              { value: "official", label: "Official documents only" },
              { value: "records", label: "Teaching records only" },
            ]}
            placeholder="Official documents and records"
          />
          <Picker
            label="Preparation status"
            value={recordStatus}
            onChange={setRecordStatus}
            options={[
              { value: "", label: "All preparation states" },
              { value: "draft", label: "Draft" },
              { value: "submitted", label: "Submitted" },
              { value: "reviewed", label: "Reviewed" },
            ]}
            placeholder="All preparation states"
          />
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand-strong" aria-hidden="true" />
          <h2 className="scolapro-section-title">Official documents</h2>
        </div>
        <p className="scolapro-section-description">
          Allocation-scoped official outputs your existing authority already produces. Generated on demand from the school document
          identity — never a second copy of school data.
        </p>
        {visibleDocuments.length ? (
          <ul className="mt-4 divide-y divide-border-subtle">
            {visibleDocuments.map((document) => (
              <li key={document.id} className="flex flex-col gap-3 py-4 first:pt-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="scolapro-record-title">{document.grade} {document.registerClass} official class list</p>
                    <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-brand-strong">
                      Official
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[document.subjectNames.join(", "), `Academic year ${document.academicYear}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a
                    href={document.printHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium outline-none transition hover:bg-surface-muted focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]"
                  >
                    <Printer className="size-3.5" aria-hidden="true" />
                    Open print view
                  </a>
                  <a
                    href={document.pdfHref}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium outline-none transition hover:bg-surface-muted focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]"
                  >
                    <FileDown className="size-3.5" aria-hidden="true" />
                    Download PDF
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No official documents match"
            description="No allocation-scoped official document matches the current search and filters."
          />
        )}
        <p className="mt-3 inline-flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
          <Printer className="size-3.5" aria-hidden="true" />
          Printing uses the dedicated official document template, not a browser capture.
        </p>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="scolapro-section-title">Your teaching records</h2>
        </div>
        <p className="scolapro-section-description">
          Lesson-preparation entries you own. These are canonical teaching records held in the connected teaching plan — they are not
          uploaded files and have no separate download.
        </p>
        <a
          href="/teaching"
          className="scolapro-cta mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium outline-none transition hover:bg-surface-muted focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]"
        >
          Open teaching workspace
          <ArrowUpRight className="scolapro-cta-icon size-3.5" aria-hidden="true" />
        </a>
        {recordsByAllocation.length ? (
          <div className="mt-4 space-y-4">
            {recordsByAllocation.map(([recordAllocationId, records]) => {
              const allocation = allocationById.get(recordAllocationId);
              return (
                <article key={recordAllocationId} className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
                  <p className="scolapro-record-title">
                    {allocation ? `${allocation.subjectName} · ${allocation.className ?? "Unassigned class"}` : "Allocation"}
                  </p>
                  <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                    {allocation ? `${allocation.gradeName} · ` : ""}
                    {records.length} {records.length === 1 ? "record" : "records"}
                  </p>
                  <ul className="mt-2 divide-y divide-border-subtle">
                    {records.map((record) => (
                      <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium">Lesson preparation · {formatDate(record.plannedOn)}</p>
                          <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                            {record.submittedAt ? `Submitted ${formatDate(record.submittedAt.slice(0, 10))}` : "Not submitted"}
                            {record.reviewedAt ? ` · Reviewed ${formatDate(record.reviewedAt.slice(0, 10))}` : ""}
                            {record.reviewNote ? " · Review note recorded" : ""}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${statusTone(record.status)}`}>
                          {preparationStatusLabels[record.status] ?? pretty(record.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No teaching records match"
            description="No lesson-preparation record of yours matches the current search and filters."
          />
        )}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="scolapro-section-title">Uncategorised</h2>
        </div>
        <p className="scolapro-section-description">
          {taxonomySourced
            ? "An authoritative teacher-file taxonomy is recorded, so documents can be grouped against it."
            : "The official teacher-file taxonomy is not yet sourced. Documents are grouped only by metadata that already exists — allocation, subject, class, grade, academic year and preparation state. No Ministry/NIED table of contents has been invented."}
        </p>
        <div className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-border p-4">
          <p className="text-xs font-medium">Upload is not offered here</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The canonical model has no governed teacher-owned document or upload authority yet, so this hub will not present an upload
            control it cannot honestly support. Skill and professional-development files, personal teaching portfolios and other
            teacher-owned documents cannot be stored until a governed document model exists.
          </p>
        </div>
        <div className="mt-3">
          <EmptyState
            title="No uncategorised files"
            description="There is no teacher-owned file store to draw uncategorised documents from."
            hint="HOD preparation review stays in its separate governed workspace and is not merged into personal files."
          />
        </div>
      </section>
    </div>
  );
}
