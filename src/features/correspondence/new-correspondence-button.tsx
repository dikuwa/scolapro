"use client";

import { useState, useTransition } from "react";
import { FilePlus2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import { createCorrespondenceDraft } from "@/features/correspondence/server/actions";
import { CORRESPONDENCE_TEMPLATES } from "@/features/correspondence/templates";

export function NewCorrespondenceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateKey, setTemplateKey] = useState(CORRESPONDENCE_TEMPLATES[0].key as string);
  const [pending, startTransition] = useTransition();
  return <>
    <Button onClick={() => setOpen(true)}><FilePlus2 className="size-4" />New correspondence</Button>
    {open ? <div className="fixed inset-0 z-[150] grid place-items-center bg-[color:var(--foreground)]/15 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-correspondence-title" className="w-full max-w-lg rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-5 shadow-[var(--shadow-md)]">
        <div className="flex items-start justify-between gap-4"><div><h2 id="new-correspondence-title" className="scolapro-section-title">Create correspondence</h2><p className="scolapro-section-description">Start from a controlled school template. You can edit all correspondence fields before finalizing.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-xs)] text-muted-foreground hover:bg-surface-muted"><X className="size-4" /></button></div>
        <div className="mt-4"><Picker label="Template" value={templateKey} onChange={setTemplateKey} placeholder="Choose template" options={CORRESPONDENCE_TEMPLATES.map((template) => ({ value: template.key, label: template.label }))} /></div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => startTransition(async () => { const result = await createCorrespondenceDraft(templateKey); if (!result.success || !result.documentId) { toast.error(result.message); return; } toast.success(result.message); router.push(`/correspondence/${result.documentId}`); })}>Create draft</Button></div>
      </section>
    </div> : null}
  </>;
}
