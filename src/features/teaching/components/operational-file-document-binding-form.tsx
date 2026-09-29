"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { FileUp, Link2 } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  bindTeacherOperationalFileDocument,
  type OperationalFileReferenceActionState,
} from "@/features/teaching/server/operational-file-resource-actions";
import type { TeachingFileProfessionalDocument } from "@/features/teaching/server/file-queries";

const initialState: OperationalFileReferenceActionState = { success: false, message: "" };

export function OperationalFileDocumentBindingForm({
  templateItemId,
  documents,
}: {
  templateItemId: string;
  documents: TeachingFileProfessionalDocument[];
}) {
  const activeDocuments = useMemo(
    () => documents.filter((document) => document.status === "active"),
    [documents],
  );
  const [documentId, setDocumentId] = useState("");
  const [state, action, pending] = useActionState(bindTeacherOperationalFileDocument, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      setDocumentId("");
    } else {
      toast.error(state.message);
    }
  }, [state]);

  if (!activeDocuments.length) {
    return (
      <a
        href="#professional-files-upload"
        className="scolapro-cta mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-[0.68rem] font-medium hover:bg-surface-muted"
      >
        <FileUp className="size-3" aria-hidden="true" />
        Upload professional evidence
      </a>
    );
  }

  return (
    <form action={action} className="mt-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-2.5">
      <input type="hidden" name="templateItemId" value={templateItemId} />
      <input type="hidden" name="documentId" value={documentId} />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <SearchableSelect
          label="Link my professional document"
          value={documentId}
          onChange={setDocumentId}
          options={activeDocuments.map((document) => ({
            value: document.id,
            label: document.title?.trim() || document.originalFilename,
            helper: document.categoryLabel || document.originalFilename,
            searchText: `${document.title ?? ""} ${document.originalFilename} ${document.categoryLabel ?? ""}`,
          }))}
          placeholder="Choose evidence…"
          searchPlaceholder="Search my uploads…"
        />
        <button
          type="submit"
          disabled={!documentId || pending}
          className="scolapro-cta inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-semibold text-white disabled:opacity-55"
        >
          <Link2 className="size-3.5" aria-hidden="true" />
          {pending ? "Linking…" : "Link evidence"}
        </button>
      </div>
      <p className="mt-2 text-[0.68rem] text-muted-foreground">
        This creates a reference to your existing private upload. The binary file is not copied.
      </p>
      {state.message ? <p aria-live="polite" className="mt-1 text-[0.68rem] text-muted-foreground">{state.message}</p> : null}
    </form>
  );
}
