"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FileQuestion,
  Folder,
  FolderKanban,
  Link2,
  Printer,
  Search,
  X,
} from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OperationalFileDocumentBindingForm } from "@/features/teaching/components/operational-file-document-binding-form";
import { OperationalFileExternalReferenceForm } from "@/features/teaching/components/operational-file-external-reference-form";
import type { TeachingFileProfessionalDocument } from "@/features/teaching/server/file-queries";
import type { OperationalTeachingFilesWorkspace } from "@/features/teaching/server/operational-files-workspace";

const statusLabel = {
  resolved: "Resolved",
  missing: "Missing",
  unavailable: "Unavailable",
  manual: "Manual",
  external: "External",
} as const;

function statusClass(status: keyof typeof statusLabel) {
  if (status === "resolved") return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
  if (status === "external") return "bg-brand-soft text-brand-strong";
  if (status === "missing") return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
  return "bg-surface-muted text-muted-foreground";
}

function StatusIcon({ status }: { status: keyof typeof statusLabel }) {
  if (status === "resolved") return <CircleCheck className="size-3.5" aria-hidden="true" />;
  if (status === "external") return <ExternalLink className="size-3.5" aria-hidden="true" />;
  if (status === "missing") return <CircleAlert className="size-3.5" aria-hidden="true" />;
  return <FileQuestion className="size-3.5" aria-hidden="true" />;
}

export function OperationalTeachingFiles({
  workspace,
  professionalDocuments,
}: {
  workspace: OperationalTeachingFilesWorkspace;
  professionalDocuments: TeachingFileProfessionalDocument[];
}) {
  const [query, setQuery] = useState("");
  const [fileType, setFileType] = useState("preparation");
  const [subject, setSubject] = useState("");
  const [phase, setPhase] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [evidenceStatus, setEvidenceStatus] = useState("");

  const fileTypeOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const allocation of workspace.allocations) {
      for (const item of allocation.fileTypes) options.set(item.fileTypeKey, item.displayName);
    }
    return [...options].map(([value, label]) => ({ value, label }));
  }, [workspace.allocations]);

  const teacherFileFolders = useMemo(() => {
    const definitions = [
      { key: "preparation", title: "Preparation File", description: "Syllabi, schemes of work, lesson preparation and PAAI commitment." },
      { key: "administration", title: "Administration File", description: "Timetables, class records, assessment records, policies and administration." },
      { key: "question_paper", title: "Assessment / Question Paper File", description: "Canonical assessment and question-paper evidence where the governed template defines it." },
      { key: "resource", title: "Professional Development / Resource File", description: "Teaching resources, learning-support material, workshops and professional resources." },
    ] as const;

    return definitions.map((definition) => {
      let total = 0;
      let available = 0;
      for (const allocation of workspace.allocations) {
        const current = allocation.fileTypes.find((item) => item.fileTypeKey === definition.key);
        if (!current) continue;
        for (const section of current.sections) {
          for (const item of section.items) {
            total += 1;
            if (["resolved", "external"].includes(item.evidence.status)) available += 1;
          }
        }
      }
      return { ...definition, total, available };
    });
  }, [workspace.allocations]);

  const subjectOptions = useMemo(
    () =>
      [...new Set(workspace.allocations.map((allocation) => allocation.subjectName))]
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value })),
    [workspace.allocations],
  );

  const phaseOptions = useMemo(
    () =>
      [...new Set(workspace.allocations.map((allocation) => allocation.phaseLabel).filter((value): value is string => Boolean(value)))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((value) => ({ value, label: value })),
    [workspace.allocations],
  );

  const sourceOptions = useMemo(() => {
    const values = new Set<string>();
    for (const allocation of workspace.allocations) {
      for (const item of allocation.fileTypes) {
        for (const section of item.sections) {
          for (const requirement of section.items) values.add(requirement.resolverType);
        }
      }
    }
    return [...values]
      .sort()
      .map((value) => ({ value, label: value.replaceAll("_", " ") }));
  }, [workspace.allocations]);

  const visibleAllocations = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();

    return workspace.allocations
      .map((allocation) => {
        if (subject && allocation.subjectName !== subject) return [];
        if (phase && allocation.phaseLabel !== phase) return [];

        const allocationText = [
          allocation.subjectName,
          allocation.gradeName,
          allocation.className ?? "",
          allocation.sourceTitle,
          allocation.authority,
          allocation.phaseLabel ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase();

        const fileTypes = allocation.fileTypes.flatMap((currentFileType) => {
          if (fileType && currentFileType.fileTypeKey !== fileType) return [];

          if (!currentFileType.sections.length) {
            const queryMatch =
              !needle ||
              `${allocationText} ${currentFileType.displayName}`
                .toLocaleLowerCase()
                .includes(needle);
            if (!queryMatch || sourceType || evidenceStatus) return [];
            return [currentFileType];
          }

          const sections = currentFileType.sections.flatMap((section) => {
            const items = section.items.filter((item) => {
              if (sourceType && item.resolverType !== sourceType) return false;
              if (evidenceStatus && item.evidence.status !== evidenceStatus) return false;

              if (!needle) return true;
              const referenceText = item.evidence.references
                .map((reference) => reference.label)
                .join(" ");
              const haystack = [
                allocationText,
                currentFileType.displayName,
                section.title,
                item.label,
                item.resolverType,
                item.evidence.status,
                referenceText,
                item.evidence.reason ?? "",
              ]
                .join(" ")
                .toLocaleLowerCase();
              return haystack.includes(needle);
            });

            return items.length ? [{ ...section, items }] : [];
          });

          return sections.length ? [{ ...currentFileType, sections }] : [];
        });

        return fileTypes.length ? [{ ...allocation, fileTypes }] : [];
      })
      .flat();
  }, [workspace.allocations, query, fileType, subject, phase, sourceType, evidenceStatus]);

  const filtersActive = Boolean(query || subject || phase || sourceType || evidenceStatus || (fileType && fileType !== "preparation"));

  function clearFilters() {
    setQuery("");
    setFileType("preparation");
    setSubject("");
    setPhase("");
    setSourceType("");
    setEvidenceStatus("");
  }

  if (!workspace.allocations.length && !workspace.unsupportedAllocations.length) return null;

  const hasGovernedFiles = workspace.allocations.length > 0;

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <FolderKanban className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" />
          <div>
            <h2 className="scolapro-section-title">My operational files</h2>
            <p className="scolapro-section-description">
              Open one of your required teacher files. ScolaPro links each requirement to canonical evidence wherever that record already exists.
            </p>
          </div>
        </div>
        <a
          href="/api/teaching/files/inspection-pack"
          target="_blank"
          rel="noopener noreferrer"
          className="scolapro-cta inline-flex min-h-9 w-fit shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted px-3 text-xs font-medium hover:bg-surface-elevated"
        >
          <Printer className="size-3.5" aria-hidden="true" />
          Inspection pack
        </a>
      </div>

      {hasGovernedFiles ? (
        <div className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {teacherFileFolders.map((folder, index) => {
              const active = fileType === folder.key;
              return (
                <button
                  key={folder.key}
                  type="button"
                  onClick={() => setFileType(folder.key)}
                  aria-pressed={active}
                  className={
                    "group min-h-44 rounded-[var(--radius-sm)] border p-4 text-left transition-colors " +
                    (active
                      ? "border-brand bg-brand-soft/45"
                      : "border-border-subtle bg-surface-elevated hover:bg-surface-muted")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-[var(--radius-sm)] bg-surface shadow-[var(--shadow-xs)]">
                      <Folder className="size-5 text-brand-strong" aria-hidden="true" />
                    </span>
                    <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      File {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">{folder.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{folder.description}</p>
                  <p className="mt-3 text-[0.68rem] font-medium text-muted-foreground">
                    {folder.total ? `${folder.available} of ${folder.total} requirements available` : "Open file requirements"}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              Subject File is separate: it is the school-owned, subject-head file shared with subject teachers.
            </p>
            <Link href="/teaching/subject-file" className="scolapro-cta text-xs font-medium text-brand-strong hover:underline">
              Open Subject File
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-3 text-xs text-muted-foreground">
          Your current teaching allocations do not yet have a verified operational-file template. Your canonical professional files and teaching records remain available below.
        </div>
      )}

      {hasGovernedFiles ? (
        <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="block text-xs font-medium leading-4">
              Search requirements
              <span className="relative mt-1.5 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="File, section, item, subject…"
                  className="scolapro-control-surface min-h-10 w-full rounded-[var(--radius-sm)] pl-9 pr-3 text-sm outline-none"
                />
              </span>
            </label>
            <SearchableSelect
              label="File"
              value={fileType}
              onChange={setFileType}
              options={fileTypeOptions}
              placeholder="All files"
              searchPlaceholder="Search file types…"
              clearable
              onClear={() => setFileType("")}
            />
            <SearchableSelect
              label="Subject"
              value={subject}
              onChange={setSubject}
              options={subjectOptions}
              placeholder="All subjects"
              searchPlaceholder="Search subjects…"
              clearable
              onClear={() => setSubject("")}
            />
            <SearchableSelect
              label="Phase"
              value={phase}
              onChange={setPhase}
              options={phaseOptions}
              placeholder="All phases"
              searchPlaceholder="Search phases…"
              clearable
              onClear={() => setPhase("")}
            />
            <SearchableSelect
              label="Source type"
              value={sourceType}
              onChange={setSourceType}
              options={sourceOptions}
              placeholder="All source types"
              searchPlaceholder="Search source types…"
              clearable
              onClear={() => setSourceType("")}
            />
            <SearchableSelect
              label="Status"
              value={evidenceStatus}
              onChange={setEvidenceStatus}
              options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))}
              placeholder="All statuses"
              searchPlaceholder="Search statuses…"
              clearable
              onClear={() => setEvidenceStatus("")}
            />
          </div>
          {filtersActive ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="scolapro-cta inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-[0.68rem] font-medium hover:bg-surface-elevated"
              >
                <X className="size-3" aria-hidden="true" />
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {visibleAllocations.length ? (
        <div className="mt-4 space-y-5">
          {visibleAllocations.map((allocation) => (
            <article
              key={allocation.allocationId}
              className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3 sm:p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">
                    {allocation.subjectName} · {allocation.gradeName}
                    {allocation.className ? " · " + allocation.className : ""}
                  </h3>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {allocation.authority} · {allocation.sourceTitle} · Version {allocation.templateVersion}
                    {allocation.phaseLabel ? " · " + allocation.phaseLabel : ""}
                  </p>
                </div>
                <span className="w-fit rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-wide text-brand-strong">
                  Authoritative template
                </span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {allocation.fileTypes.map((currentFileType) => (
                  <section
                    key={currentFileType.id}
                    className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3"
                  >
                    <h4 className="text-xs font-semibold uppercase tracking-wide">
                      {currentFileType.displayName}
                    </h4>

                    {currentFileType.sections.length ? (
                      <div className="mt-3 space-y-3">
                        {currentFileType.sections.map((section) => (
                          <div key={section.id}>
                            <p className="text-xs font-medium">{section.title}</p>
                            <ul className="mt-1.5 divide-y divide-border-subtle">
                              {section.items.map((item) => (
                                <li key={item.id} className="py-2.5 first:pt-1">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium">{item.label}</p>
                                      <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                                        Source: {item.resolverType.replaceAll("_", " ")}
                                      </p>
                                      {item.evidence.reason ? (
                                        <p className="mt-1 text-[0.68rem] leading-4 text-muted-foreground">
                                          {item.evidence.reason}
                                        </p>
                                      ) : null}
                                    </div>
                                    <span
                                      className={
                                        "inline-flex w-fit shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide " +
                                        statusClass(item.evidence.status)
                                      }
                                    >
                                      <StatusIcon status={item.evidence.status} />
                                      {statusLabel[item.evidence.status]}
                                    </span>
                                  </div>

                                  {item.evidence.references.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {item.evidence.references.map((reference) =>
                                        reference.href ? (
                                          <Link
                                            key={reference.id}
                                            href={reference.href}
                                            className="scolapro-cta inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-[0.68rem] font-medium hover:bg-surface-muted"
                                          >
                                            <Link2 className="size-3" aria-hidden="true" />
                                            {item.evidence.status === "external" ? "Official source" : "Open"} · {reference.label}
                                            <ArrowUpRight className="size-3" aria-hidden="true" />
                                          </Link>
                                        ) : (
                                          <span
                                            key={reference.id}
                                            className="inline-flex min-h-8 items-center rounded-[var(--radius-sm)] bg-surface px-2.5 text-[0.68rem] text-muted-foreground"
                                          >
                                            {reference.label}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  ) : null}

                                  {item.evidence.status === "missing" &&
                                  ["shared_resource", "external_link"].includes(item.resolverType) ? (
                                    <div className="mt-2"><p className="mb-1 text-[0.68rem] text-muted-foreground">Add a governed reference for this missing shared/official resource; completion still depends on the evidence resolver.</p><OperationalFileExternalReferenceForm templateItemId={item.id} title={item.label} /></div>
                                  ) : null}

                                  {item.evidence.status === "missing" && item.resolverType === "teacher_document" ? (
                                    <div className="mt-2">
                                      <p className="mb-1 text-[0.68rem] text-muted-foreground">Upload/select teacher-supplied evidence only for this requirement.</p>
                                      <OperationalFileDocumentBindingForm
                                      templateItemId={item.id}
                                      documents={professionalDocuments}
                                      />
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-[var(--radius-xs)] border border-dashed border-border p-3">
                        <p className="text-xs font-medium">Recognized file type</p>
                        <p className="mt-1 text-[0.68rem] text-muted-foreground">
                          No internal hierarchy is defined by the authoritative source, so ScolaPro does not invent one.
                        </p>
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : hasGovernedFiles ? (
        <p className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-4 text-sm text-muted-foreground">
          No operational-file requirements match the current filters.
        </p>
      ) : null}

      {workspace.unsupportedAllocations.length && hasGovernedFiles ? (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <CircleAlert className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-semibold">Subjects without a verified operational-file template</p>
          </div>
          <ul className="mt-2 space-y-2">
            {workspace.unsupportedAllocations.map((allocation) => (
              <li key={allocation.allocationId} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {allocation.subjectName} · {allocation.gradeName}
                  {allocation.className ? " · " + allocation.className : ""}
                </span>
                {" — "}
                {allocation.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
