"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowUpRight,
  CircleAlert,
  Eye,
  FileDown,
  FileUp,
  FolderOpen,
  Info,
  ListChecks,
  Printer,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  archiveTeacherProfessionalDocument,
  finalizeTeacherProfessionalDocument,
  prepareTeacherProfessionalDocumentUpload,
} from "@/features/teaching/server/professional-documents";

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

type ProfessionalDocument = {
  id: string;
  originalFilename: string;
  title: string | null;
  categoryLabel: string | null;
  mimeType: string;
  fileSize: number;
  status: "active" | "archived";
  createdAt: string;
  archivedAt: string | null;
  viewHref: string;
  downloadHref: string;
};

export type TeachingFilesHubProps = {
  today: string;
  academicYear: number;
  allocations: Allocation[];
  officialDocuments: OfficialDocument[];
  preparationRecords: PreparationRecord[];
  professionalDocuments: ProfessionalDocument[];
  taxonomySourced?: boolean;
  ownerSchoolId: string | null;
  ownerStaffMemberId: string | null;
  canUploadProfessionalDocuments: boolean;
};

const preparationStatusLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  reviewed: "Reviewed",
  returned: "Returned",
};

const uploadAccept = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
].join(",");

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
  const {
    allocations,
    officialDocuments,
    preparationRecords,
    professionalDocuments,
    academicYear,
    taxonomySourced = false,
    ownerSchoolId,
    ownerStaffMemberId,
    canUploadProfessionalDocuments,
  } = props;
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [allocationId, setAllocationId] = useState("");
  const [itemType, setItemType] = useState("");
  const [recordStatus, setRecordStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const allocationById = useMemo(
    () => new Map(allocations.map((allocation) => [allocation.allocationId, allocation])),
    [allocations],
  );
  const scopedAllocationIds = useMemo(
    () => new Set(allocations.map((allocation) => allocation.allocationId)),
    [allocations],
  );

  const normalized = query.trim().toLocaleLowerCase();

  const visibleProfessionalDocuments = useMemo(() => {
    if (itemType === "official" || itemType === "records" || allocationId) return [];
    return professionalDocuments.filter((document) => {
      if (!normalized) return true;
      return [
        document.title ?? "",
        document.originalFilename,
        document.categoryLabel ?? "uncategorised",
        document.status,
      ].join(" ").toLocaleLowerCase().includes(normalized);
    });
  }, [allocationId, itemType, normalized, professionalDocuments]);

  const visibleDocuments = useMemo(() => {
    if (itemType === "professional" || itemType === "records") return [];
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
      ].join(" ").toLocaleLowerCase().includes(normalized);
    });
  }, [allocationId, allocationById, itemType, normalized, officialDocuments]);

  const visibleRecords = useMemo(() => {
    if (itemType === "professional" || itemType === "official") return [];
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
      ].join(" ").toLocaleLowerCase().includes(normalized);
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

  async function uploadProfessionalDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerSchoolId || !ownerStaffMemberId) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) {
      toast.error("Choose a professional document to upload.");
      return;
    }

    setUploading(true);
    try {
      const ticket = await prepareTeacherProfessionalDocumentUpload({
        schoolId: ownerSchoolId,
        staffMemberId: ownerStaffMemberId,
        originalFilename: file.name,
        mimeType: file.type,
        fileSize: file.size,
      });
      if (!ticket.success || !ticket.storagePath || !ticket.token || !ticket.documentId || !ticket.mimeType) {
        toast.error(ticket.message ?? "Upload could not be prepared.");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("teacher-professional-documents")
        .uploadToSignedUrl(ticket.storagePath, ticket.token, file, {
          contentType: ticket.mimeType,
          upsert: false,
        });
      if (uploadError) {
        toast.error("The file could not be uploaded to private storage.");
        return;
      }

      const result = await finalizeTeacherProfessionalDocument({
        documentId: ticket.documentId,
        schoolId: ownerSchoolId,
        staffMemberId: ownerStaffMemberId,
        storagePath: ticket.storagePath,
        originalFilename: file.name,
        mimeType: ticket.mimeType,
        fileSize: file.size,
        title: String(formData.get("title") ?? ""),
        categoryLabel: String(formData.get("categoryLabel") ?? ""),
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      form.reset();
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function archiveDocument(documentId: string) {
    setArchivingId(documentId);
    try {
      const result = await archiveTeacherProfessionalDocument(documentId);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Professional files</h2>
        <p className="scolapro-section-description">
          Teacher-owned uploads, official outputs and connected teaching records stay in their governed source models. Uploaded categories are neutral personal labels, not an official Ministry/NIED table of contents.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="My uploads" value={professionalDocuments.length} icon={FileUp} />
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
                placeholder="Title, filename, subject, class…"
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
              { value: "", label: "All teaching files" },
              { value: "professional", label: "My uploads only" },
              { value: "official", label: "Official documents only" },
              { value: "records", label: "Teaching records only" },
            ]}
            placeholder="All teaching files"
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
              { value: "returned", label: "Returned" },
            ]}
            placeholder="All preparation states"
          />
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2">
          <FileUp className="size-4 text-brand-strong" aria-hidden="true" />
          <h2 className="scolapro-section-title">My uploaded professional documents</h2>
        </div>
        <p className="scolapro-section-description">
          Private teacher-owned files. Only your current teacher identity can list or open these records; leadership review is not granted by this foundation.
        </p>

        {canUploadProfessionalDocuments && ownerSchoolId && ownerStaffMemberId ? (
          <form onSubmit={uploadProfessionalDocument} className="mt-4 grid gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
            <label className="text-xs font-medium leading-4">
              File
              <input
                name="file"
                type="file"
                accept={uploadAccept}
                required
                className="mt-1.5 block min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-[0.68rem] font-normal text-muted-foreground">PDF, DOCX, XLSX, PPTX, JPG or PNG · maximum 10 MB.</span>
            </label>
            <label className="text-xs font-medium leading-4">
              Title
              <input name="title" maxLength={180} placeholder="Optional display title" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
            </label>
            <label className="text-xs font-medium leading-4">
              Category label
              <input name="categoryLabel" maxLength={120} placeholder="Optional neutral label" className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)]" />
              <span className="mt-1 block text-[0.68rem] font-normal text-muted-foreground">A personal label only; it does not represent an official requirement.</span>
            </label>
            <button type="submit" disabled={uploading} className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">
              <FileUp className="size-4" aria-hidden="true" />
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </form>
        ) : (
          <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-4">
            <p className="text-xs font-medium">Upload unavailable in this role context</p>
            <p className="mt-1 text-xs text-muted-foreground">Teacher-owned upload requires a current teacher/class-teacher/HOD membership linked to an effective staff placement.</p>
          </div>
        )}

        {visibleProfessionalDocuments.length ? (
          <ul className="mt-4 divide-y divide-border-subtle">
            {visibleProfessionalDocuments.map((document) => (
              <li key={document.id} className="flex flex-col gap-3 py-4 first:pt-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="scolapro-record-title">{document.title || document.originalFilename}</p>
                    <span className={`rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${document.status === "active" ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-muted-foreground"}`}>
                      {document.status}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {document.categoryLabel || "Uncategorised"} · {document.originalFilename} · {formatBytes(document.fileSize)} · Uploaded {formatDate(document.createdAt)}
                    {document.archivedAt ? ` · Archived ${formatDate(document.archivedAt)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a href={document.viewHref} target="_blank" rel="noopener noreferrer" className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium hover:bg-surface-muted">
                    <Eye className="size-3.5" aria-hidden="true" /> View
                  </a>
                  <a href={document.downloadHref} className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium hover:bg-surface-muted">
                    <FileDown className="size-3.5" aria-hidden="true" /> Download
                  </a>
                  {document.status === "active" ? (
                    <button
                      type="button"
                      disabled={archivingId === document.id}
                      onClick={() => archiveDocument(document.id)}
                      className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-medium hover:bg-surface-elevated disabled:opacity-60"
                    >
                      <Archive className="size-3.5" aria-hidden="true" /> {archivingId === document.id ? "Archiving…" : "Archive"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No uploaded professional documents match"
            description="No teacher-owned upload matches the current search and filters."
            hint="Uncategorised is valid until you choose a neutral personal label."
          />
        )}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand-strong" aria-hidden="true" />
          <h2 className="scolapro-section-title">Official documents</h2>
        </div>
        <p className="scolapro-section-description">
          Allocation-scoped official outputs generated on demand from the existing shared document foundation.
        </p>
        {visibleDocuments.length ? (
          <ul className="mt-4 divide-y divide-border-subtle">
            {visibleDocuments.map((document) => (
              <li key={document.id} className="flex flex-col gap-3 py-4 first:pt-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="scolapro-record-title">{document.grade} {document.registerClass} official class list</p>
                    <span className="rounded-[var(--radius-xs)] bg-brand-soft px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-brand-strong">Official</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[document.subjectNames.join(", "), `Academic year ${document.academicYear}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a href={document.printHref} target="_blank" rel="noopener noreferrer" className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium hover:bg-surface-muted">
                    <Printer className="size-3.5" aria-hidden="true" /> Open print view
                  </a>
                  <a href={document.pdfHref} className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium hover:bg-surface-muted">
                    <FileDown className="size-3.5" aria-hidden="true" /> Download PDF
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={allocations.length ? "No official documents match" : "No effective teaching allocations"}
            description={allocations.length ? "No allocation-scoped official document matches the current search and filters." : `No subject and class allocation is active for you in ${academicYear}.`}
          />
        )}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="scolapro-section-title">Your teaching records</h2>
        </div>
        <p className="scolapro-section-description">
          Lesson-preparation entries you own. They remain canonical structured teaching records, not uploaded files.
        </p>
        <a href="/teaching" className="scolapro-cta mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium hover:bg-surface-muted">
          Open teaching workspace <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
        {recordsByAllocation.length ? (
          <div className="mt-4 space-y-4">
            {recordsByAllocation.map(([recordAllocationId, records]) => {
              const allocation = allocationById.get(recordAllocationId);
              return (
                <article key={recordAllocationId} className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
                  <p className="scolapro-record-title">{allocation ? `${allocation.subjectName} · ${allocation.className ?? "Unassigned class"}` : "Allocation"}</p>
                  <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{allocation ? `${allocation.gradeName} · ` : ""}{records.length} {records.length === 1 ? "record" : "records"}</p>
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
            title={allocations.length ? "No teaching records match" : "No effective teaching allocations"}
            description={allocations.length ? "No lesson-preparation record of yours matches the current search and filters." : `No subject and class allocation is active for you in ${academicYear}.`}
          />
        )}
      </section>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="scolapro-section-title">Taxonomy status</h2>
        </div>
        <p className="scolapro-section-description">
          {taxonomySourced
            ? "An authoritative teacher-file taxonomy is recorded, so verified categories may be mapped against it."
            : "The official teacher-file taxonomy is not yet sourced. Uploaded category labels remain neutral teacher-defined labels or Uncategorised; no Ministry/NIED table of contents has been invented."}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          HOD preparation review remains in its separate governed workspace. This owner-only document foundation does not grant leadership cross-teacher browsing.
        </p>
      </section>
    </div>
  );
}
