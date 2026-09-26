"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
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
  LibraryBig,
  ListChecks,
  Paperclip,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
import { Spinner } from "@/components/ui/spinner";
import {
  FormActionSlot,
  FormFieldFeedback,
  formFieldControlOffsetClass,
  formFieldLabelClass,
  formRowAlignClass,
} from "@/components/ui/form-field-layout";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  PROFESSIONAL_DOCUMENT_ARCHIVE_FIRST_MESSAGE,
  PROFESSIONAL_DOCUMENT_DELETE_UNAVAILABLE_MESSAGE,
  TEACHER_PROFESSIONAL_DOCUMENT_ACCEPT,
  TEACHER_PROFESSIONAL_DOCUMENT_BUCKET,
  resolveTeacherProfessionalDocumentMimeType,
  teacherProfessionalDocumentUploadIssue,
} from "@/features/teaching/professional-document-policy";
import {
  archiveTeacherProfessionalDocument,
  finalizeTeacherProfessionalDocument,
  permanentlyDeleteTeacherProfessionalDocument,
  prepareTeacherProfessionalDocumentUpload,
  submitTeacherProfessionalDocumentForReview,
} from "@/features/teaching/server/professional-documents";

type Allocation = {
  allocationId: string;
  subjectId: string;
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

type AuthoritativeResource = {
  id: string;
  title: string;
  description: string;
  href: string;
  sourceModule: string;
  availability: "available" | "no_allocation";
  exportNote: string | null;
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
  reviewStatus: "submitted" | "returned" | "reviewed" | null;
  reviewSubjectId: string | null;
  reviewSubjectName: string | null;
  reviewNote: string | null;
  /** Governed permanent deletion (Issue #676); resolved by the server read model. */
  canPermanentlyDelete: boolean;
  permanentDeleteBlockedReason: string | null;
};

export type TeachingFilesHubProps = {
  today: string;
  academicYear: number;
  allocations: Allocation[];
  officialDocuments: OfficialDocument[];
  preparationRecords: PreparationRecord[];
  professionalDocuments: ProfessionalDocument[];
  authoritativeResources: AuthoritativeResource[];
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
    authoritativeResources,
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<{ documentId: string; tone: "success" | "error"; message: string } | null>(null);
  const [submittingReviewId, setSubmittingReviewId] = useState<string | null>(null);
  const [reviewSubjectByDocument, setReviewSubjectByDocument] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allocationById = useMemo(
    () => new Map(allocations.map((allocation) => [allocation.allocationId, allocation])),
    [allocations],
  );
  const scopedAllocationIds = useMemo(
    () => new Set(allocations.map((allocation) => allocation.allocationId)),
    [allocations],
  );

  const normalized = query.trim().toLocaleLowerCase();

  const visibleAuthoritativeResources = useMemo(() => {
    if (itemType === "professional" || itemType === "official" || itemType === "records" || allocationId) return [];
    return authoritativeResources.filter((resource) => {
      if (!normalized) return true;
      return [resource.title, resource.description, resource.sourceModule]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [allocationId, authoritativeResources, itemType, normalized]);

  const visibleProfessionalDocuments = useMemo(() => {
    if (itemType === "authoritative" || itemType === "official" || itemType === "records" || allocationId) return [];
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
    if (itemType === "authoritative" || itemType === "professional" || itemType === "records") return [];
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
    if (itemType === "authoritative" || itemType === "professional" || itemType === "official") return [];
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

  const reviewSubjectOptions = [...new Map(
    allocations
      .filter((allocation) => allocation.subjectId)
      .map((allocation) => [allocation.subjectId, { value: allocation.subjectId, label: allocation.subjectName }]),
  ).values()];

  // The styled file control still uses a real (visually hidden) file input, so
  // selection is validated here before any signed upload ticket is requested.
  function selectProfessionalDocumentFile(file: File | null) {
    setUploadStatus(null);
    if (!file) {
      setSelectedFile(null);
      setFileError(null);
      return;
    }
    setSelectedFile(file);
    setFileError(
      teacherProfessionalDocumentUploadIssue({ name: file.name, size: file.size, type: file.type }),
    );
  }

  async function uploadProfessionalDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerSchoolId || !ownerStaffMemberId) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    if (!selectedFile) {
      const message = "Choose a professional document to upload.";
      setFileError(message);
      setUploadStatus({ tone: "error", message });
      return;
    }

    const issue = teacherProfessionalDocumentUploadIssue({
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
    });
    if (issue) {
      setFileError(issue);
      setUploadStatus({ tone: "error", message: issue });
      return;
    }

    const mimeType = resolveTeacherProfessionalDocumentMimeType(selectedFile.name, selectedFile.type);
    if (!mimeType) {
      const message = "Choose a PDF, DOCX, XLSX, PPTX, JPG or PNG file.";
      setFileError(message);
      setUploadStatus({ tone: "error", message });
      return;
    }

    setUploading(true);
    setFileError(null);
    setUploadStatus(null);
    try {
      const ticket = await prepareTeacherProfessionalDocumentUpload({
        schoolId: ownerSchoolId,
        staffMemberId: ownerStaffMemberId,
        originalFilename: selectedFile.name,
        mimeType,
        fileSize: selectedFile.size,
      });
      if (!ticket.success || !ticket.storagePath || !ticket.token || !ticket.documentId) {
        const message = ticket.message ?? "Upload could not be prepared.";
        setUploadStatus({ tone: "error", message });
        toast.error(message);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(TEACHER_PROFESSIONAL_DOCUMENT_BUCKET)
        .uploadToSignedUrl(ticket.storagePath, ticket.token, selectedFile, {
          contentType: ticket.mimeType ?? mimeType,
          upsert: false,
        });
      if (uploadError) {
        const message = "The file could not be uploaded to private storage. Check your connection and try again.";
        setUploadStatus({ tone: "error", message });
        toast.error(message);
        return;
      }

      const result = await finalizeTeacherProfessionalDocument({
        documentId: ticket.documentId,
        schoolId: ownerSchoolId,
        staffMemberId: ownerStaffMemberId,
        storagePath: ticket.storagePath,
        originalFilename: selectedFile.name,
        mimeType: ticket.mimeType ?? mimeType,
        fileSize: selectedFile.size,
        title: String(formData.get("title") ?? ""),
        categoryLabel: String(formData.get("categoryLabel") ?? ""),
      });
      if (!result.success) {
        setUploadStatus({ tone: "error", message: result.message });
        toast.error(result.message);
        return;
      }

      setUploadStatus({ tone: "success", message: `${result.message} It is listed below.` });
      toast.success(result.message);
      form.reset();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch {
      const message = "The upload could not be completed. Try again.";
      setUploadStatus({ tone: "error", message });
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }

  async function deleteProfessionalDocument(documentId: string) {
    setDeletingId(documentId);
    setDeleteStatus(null);
    try {
      const result = await permanentlyDeleteTeacherProfessionalDocument(documentId);
      setDeleteStatus({
        documentId,
        tone: result.success ? "success" : "error",
        message: result.message,
      });
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch {
      setDeleteStatus({
        documentId,
        tone: "error",
        message: PROFESSIONAL_DOCUMENT_DELETE_UNAVAILABLE_MESSAGE,
      });
      toast.error(PROFESSIONAL_DOCUMENT_DELETE_UNAVAILABLE_MESSAGE);
    } finally {
      setDeletingId(null);
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

  async function submitProfessionalDocumentReview(document: ProfessionalDocument) {
    const subjectId = document.reviewSubjectId || reviewSubjectByDocument[document.id];
    if (!subjectId) {
      toast.error("Choose the teaching subject for HOD review.");
      return;
    }
    setSubmittingReviewId(document.id);
    try {
      const result = await submitTeacherProfessionalDocumentForReview(document.id, subjectId);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } finally {
      setSubmittingReviewId(null);
    }
  }


  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Professional files</h2>
        <p className="scolapro-section-description">
          Teacher-owned uploads, official outputs and connected teaching records stay in their governed source models. Uploaded categories are neutral personal labels, not an official Ministry/NIED table of contents.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Authoritative links" value={authoritativeResources.length} icon={LibraryBig} />
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
              { value: "", label: "All professional-file resources" },
              { value: "authoritative", label: "Authoritative ScolaPro records" },
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

      {visibleAuthoritativeResources.length ? (
        <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="flex items-center gap-2">
            <LibraryBig className="size-4 text-brand-strong" aria-hidden="true" />
            <h2 className="scolapro-section-title">Authoritative ScolaPro records</h2>
          </div>
          <p className="scolapro-section-description">
            These are live links to the records you already maintain in ScolaPro. Opening one takes you to its source module; this hub never copies system records into your uploaded-document store.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleAuthoritativeResources.map((resource) => (
              <article key={resource.id} className="flex min-h-40 flex-col rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/55 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{resource.title}</p>
                    <p className="mt-1 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">{resource.sourceModule}</p>
                  </div>
                  <span className="rounded-[var(--radius-xs)] bg-surface px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {resource.availability === "available" ? "Linked" : "No allocation"}
                  </span>
                </div>
                <p className="mt-3 flex-1 text-xs leading-5 text-muted-foreground">{resource.description}</p>
                {resource.exportNote ? <p className="mt-2 text-[0.68rem] text-muted-foreground">{resource.exportNote}</p> : null}
                <Link href={resource.href} className="mt-4 inline-flex min-h-9 items-center gap-1.5 self-start rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium hover:bg-surface-elevated">
                  Open source module <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-center gap-2">
          <FileUp className="size-4 text-brand-strong" aria-hidden="true" />
          <h2 className="scolapro-section-title">My uploaded professional documents</h2>
        </div>
        <p className="scolapro-section-description">
          Private teacher-owned evidence and resources. Uploads stay in your owner-scoped private document store and are separate from the authoritative ScolaPro records linked above.
        </p>

        {canUploadProfessionalDocuments && ownerSchoolId && ownerStaffMemberId ? (
          <form
            onSubmit={uploadProfessionalDocument}
            className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted p-3"
          >
            <div
              className={cn(
                "grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]",
                formRowAlignClass,
              )}
            >
              <div>
                <label className={formFieldLabelClass} htmlFor="professional-document-file">
                  File
                </label>
                <div className={formFieldControlOffsetClass}>
                  <input
                    ref={fileInputRef}
                    id="professional-document-file"
                    name="file"
                    type="file"
                    accept={TEACHER_PROFESSIONAL_DOCUMENT_ACCEPT}
                    disabled={uploading}
                    aria-describedby="professional-document-file-help"
                    onChange={(event) => selectProfessionalDocumentFile(event.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                  <div className="flex min-h-10 w-full flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-2 py-1.5">
                    <label
                      htmlFor="professional-document-file"
                      className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-3 text-xs font-medium text-foreground transition-colors duration-[var(--motion-fast)] hover:bg-surface focus-within:ring-4 focus-within:ring-brand-soft"
                    >
                      <Paperclip className="size-3.5" aria-hidden="true" />
                      {selectedFile ? "Change file" : "Choose file"}
                    </label>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={selectedFile?.name ?? undefined}>
                      {selectedFile
                        ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}`
                        : "No file chosen"}
                    </span>
                  </div>
                </div>
                <FormFieldFeedback
                  helper="PDF, DOCX, XLSX, PPTX, JPG or PNG · maximum 10 MB."
                  error={fileError}
                  errorId="professional-document-file-help"
                />
              </div>
              <div>
                <label className={formFieldLabelClass} htmlFor="professional-document-title">
                  Title
                </label>
                <div className={formFieldControlOffsetClass}>
                  <input
                    id="professional-document-title"
                    name="title"
                    maxLength={180}
                    disabled={uploading}
                    placeholder="Optional display title"
                    className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)] disabled:opacity-60"
                  />
                </div>
                <FormFieldFeedback />
              </div>
              <div>
                <label className={formFieldLabelClass} htmlFor="professional-document-category">
                  Category label
                </label>
                <div className={formFieldControlOffsetClass}>
                  <input
                    id="professional-document-category"
                    name="categoryLabel"
                    maxLength={120}
                    disabled={uploading}
                    placeholder="Optional neutral label"
                    className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none focus:ring-4 focus:ring-[color:var(--brand-soft)] disabled:opacity-60"
                  />
                </div>
                <FormFieldFeedback helper="A personal label only; it does not represent an official requirement." />
              </div>
              <FormActionSlot>
                <button
                  type="submit"
                  disabled={uploading}
                  aria-busy={uploading}
                  className="scolapro-cta inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] transition-colors duration-[var(--motion-fast)] hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-60"
                >
                  {uploading ? <Spinner className="size-4 text-white" /> : <FileUp className="size-4" aria-hidden="true" />}
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </FormActionSlot>
            </div>
            <p
              role="status"
              aria-live="polite"
              className={cn(
                "mt-2 min-h-4 text-xs",
                uploadStatus?.tone === "error" ? "text-[color:var(--danger)]" : "text-muted-foreground",
              )}
            >
              {uploadStatus?.message ?? ""}
            </p>
          </form>
        ) : (
          <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-4">
            <p className="text-xs font-medium">Upload unavailable in this role context</p>
            <p className="mt-1 text-xs text-muted-foreground">Teacher-owned upload requires a current teacher/class-teacher/HOD membership linked to an effective staff placement.</p>
          </div>
        )}

        {visibleProfessionalDocuments.length ? (
          <ul className="mt-4 divide-y divide-border-subtle">
            {visibleProfessionalDocuments.map((document) => {
              const archived = document.status === "archived";
              const permanentDeleteDisabled =
                deletingId === document.id || !archived || !document.canPermanentlyDelete;
              const permanentDeleteTitle = !archived
                ? PROFESSIONAL_DOCUMENT_ARCHIVE_FIRST_MESSAGE
                : (document.permanentDeleteBlockedReason ?? undefined);
              return (
              <li key={document.id} className="flex flex-col gap-3 py-4 first:pt-1">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                  {document.reviewStatus ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      HOD review: <span className="font-medium capitalize text-foreground">{document.reviewStatus}</span>
                      {document.reviewSubjectName ? ` · ${document.reviewSubjectName}` : ""}
                      {document.reviewNote ? <p className="mt-1 break-words">Feedback: {document.reviewNote}</p> : null}
                    </div>
                  ) : null}
                  {document.status === "active" && !document.reviewStatus && reviewSubjectOptions.length ? (
                    <div className="mt-3 max-w-sm">
                      <Picker
                        label="Submit for HOD review"
                        value={reviewSubjectByDocument[document.id] ?? ""}
                        onChange={(value) => setReviewSubjectByDocument((current) => ({ ...current, [document.id]: value }))}
                        options={reviewSubjectOptions}
                        placeholder="Choose your teaching subject"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a href={document.viewHref} target="_blank" rel="noopener noreferrer" className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium hover:bg-surface-muted">
                    <Eye className="size-3.5" aria-hidden="true" /> View
                  </a>
                  <a href={document.downloadHref} className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium hover:bg-surface-muted">
                    <FileDown className="size-3.5" aria-hidden="true" /> Download
                  </a>
                  {document.status === "active" && (!document.reviewStatus || document.reviewStatus === "returned") ? (
                    <button
                      type="button"
                      disabled={submittingReviewId === document.id || (!document.reviewSubjectId && !reviewSubjectByDocument[document.id])}
                      onClick={() => submitProfessionalDocumentReview(document)}
                      className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-60"
                    >
                      {submittingReviewId === document.id
                        ? "Submitting…"
                        : document.reviewStatus === "returned" ? "Resubmit for review" : "Submit for review"}
                    </button>
                  ) : null}
                  {document.status === "active" && document.reviewStatus !== "submitted" ? (
                    <button
                      type="button"
                      disabled={archivingId === document.id}
                      onClick={() => archiveDocument(document.id)}
                      className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-muted px-3 text-xs font-medium hover:bg-surface-elevated disabled:opacity-60"
                    >
                      <Archive className="size-3.5" aria-hidden="true" /> {archivingId === document.id ? "Archiving…" : "Archive"}
                    </button>
                  ) : null}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (permanentDeleteDisabled) return;
                      void deleteProfessionalDocument(document.id);
                    }}
                  >
                    <button
                      type="submit"
                      data-confirm-destructive="true"
                      data-confirm-label={`delete ${document.title || document.originalFilename} permanently`}
                      disabled={permanentDeleteDisabled}
                      title={permanentDeleteTitle}
                      aria-describedby={permanentDeleteDisabled ? `permanent-delete-hint-${document.id}` : undefined}
                      className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-xs font-medium text-[color:var(--danger)] hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" /> {deletingId === document.id ? "Deleting…" : "Delete permanently"}
                    </button>
                  </form>
                </div>
                {permanentDeleteDisabled && permanentDeleteTitle ? (
                  <p id={`permanent-delete-hint-${document.id}`} className="mt-1 text-[0.68rem] leading-4 text-muted-foreground sm:text-right">
                    {permanentDeleteTitle}
                  </p>
                ) : null}
                {deleteStatus?.documentId === document.id ? (
                  <p role="status" className={cn("text-xs", deleteStatus.tone === "error" ? "text-[color:var(--danger)]" : "text-[color:var(--success)]")}>
                    {deleteStatus.message}
                  </p>
                ) : null}
                </div>
                </li>
              );
            })}
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
          HOD review is opt-in per professional document and subject. Only explicitly submitted files enter the governed review workspace; ordinary HOD browsing across teacher files remains prohibited.
        </p>
      </section>
    </div>
  );
}
