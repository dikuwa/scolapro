"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { discardImportBatch } from "@/features/imports/server/actions";

/** Separate intent from submission: never call the discard RPC on the initial action. */
export function ImportDiscardConfirmation({ batchId, fileName, label = "Cancel" }: { batchId: string; fileName: string; label?: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (!confirming) {
    return <Button type="button" size="sm" variant="danger-ghost" onClick={() => setConfirming(true)}><Trash2 className="size-3.5" aria-hidden="true" />{label}</Button>;
  }

  return <form action={discardImportBatch} onSubmit={() => setPending(true)} className="flex max-w-full flex-wrap items-center gap-1.5">
    <input type="hidden" name="batchId" value={batchId} />
    <span className="max-w-64 truncate text-xs text-muted-foreground" title={fileName}>Discard staged batch “{fileName}”?</span>
    <Button type="submit" size="sm" variant="danger" loading={pending}>Yes, discard</Button>
    <Button type="button" size="sm" variant="neutral" disabled={pending} onClick={() => setConfirming(false)}><X className="size-3.5" aria-hidden="true" />Keep batch</Button>
  </form>;
}
