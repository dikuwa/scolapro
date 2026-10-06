"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Heading2, Italic, Link2,
  List, ListOrdered, Mail, PenLine, Redo2, Rows3, Save, Share2, Signature, Sparkles, Underline as UnderlineIcon, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { OfficialDocumentActions } from "@/components/documents/official-document-actions";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Tooltip } from "@/components/ui/tooltip";
import {
  emailFinalizedCorrespondence,
  finalizeCorrespondenceDocument,
  recordFinalizedCorrespondenceShare,
  reviseCorrespondenceDocument,
  saveCorrespondenceDraft,
} from "@/features/correspondence/server/actions";
import { CORRESPONDENCE_FONTS, CORRESPONDENCE_FONT_SIZES } from "@/features/correspondence/rich-text";
import { CORRESPONDENCE_TEMPLATES, templateContent, type CorrespondenceTemplateKey } from "@/features/correspondence/templates";
import type { CorrespondenceDocument } from "@/features/correspondence/types";
import { useRouter } from "next/navigation";

const inputClass = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70";
const labelClass = "text-xs font-medium text-foreground";

function ToolButton({ label, active = false, disabled = false, onPress, children }: { label: string; active?: boolean; disabled?: boolean; onPress: () => void; children: React.ReactNode }) {
  const button = <button type="button" aria-label={label} aria-pressed={active || undefined} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onPress} className={`grid size-9 shrink-0 place-items-center rounded-[var(--radius-xs)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 disabled:opacity-35 ${active ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"}`}>{children}</button>;
  return <Tooltip title={label}>{button}</Tooltip>;
}

function RichTextEditor({
  value,
  onChange,
  readOnly,
  onSignature,
  aiContext,
}: {
  value: CorrespondenceDocument["body"];
  onChange: (value: CorrespondenceDocument["body"]) => void;
  readOnly: boolean;
  onSignature: () => void;
  aiContext: { subject: string; recipient: string; attention: string };
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiPending, setAiPending] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    content: value,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, horizontalRule: false, strike: false, link: { openOnClick: readOnly, autolink: false, defaultProtocol: "https" } }),
      TextStyle,
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    onUpdate: ({ editor: current }) => onChange(current.getJSON()),
    editorProps: { attributes: { class: "correspondence-prosemirror", "aria-label": "Correspondence body" } },
  });

  if (!editor) return <div className="min-h-64 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" aria-label="Loading editor" />;
  const setLink = () => {
    const href = linkUrl.trim();
    if (!/^(https?:\/\/|mailto:)/i.test(href)) { toast.error("Use a full https:// or mailto: link."); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false); setLinkUrl("");
  };

  const fullText = () => editor.getText({ blockSeparator: "\n\n" }).trim();
  const selectedText = () => {
    const { from, to } = editor.state.selection;
    return from === to ? "" : editor.state.doc.textBetween(from, to, "\n\n").trim();
  };
  const plainTextDocument = (text: string) => ({
    type: "doc",
    content: text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean)
      .map((paragraph) => ({ type: "paragraph", content: [{ type: "text", text: paragraph }] })),
  });

  const runAi = async (mode: "draft" | "improve" | "formalize" | "simplify" | "proofread" | "shorten") => {
    const range = { from: editor.state.selection.from, to: editor.state.selection.to };
    const selection = selectedText();
    const existingText = selection || fullText();
    if (mode === "draft" && !aiInstruction.trim()) {
      setAiMessage("Tell AI what the correspondence should say first.");
      return;
    }
    if (mode !== "draft" && !existingText) {
      setAiMessage("Add some correspondence text first, or use Draft from instruction.");
      return;
    }

    setAiPending(true);
    setAiMessage("");
    try {
      const response = await fetch("/api/correspondence/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          mode,
          instruction: aiInstruction.trim() || undefined,
          existingText: mode === "draft" ? undefined : existingText,
          subject: aiContext.subject || undefined,
          recipient: aiContext.recipient || undefined,
          attention: aiContext.attention || undefined,
        }),
      });
      const body = await response.json().catch(() => ({})) as { text?: string; message?: string };
      if (!response.ok || !body.text?.trim()) throw new Error(body.message || "AI assistance could not complete this request.");

      if (mode !== "draft" && selection && range.from !== range.to) {
        editor.chain().focus().insertContentAt(range, { type: "text", text: body.text.trim() }).run();
        setAiMessage("AI suggestion applied to the selected text. Review it before saving.");
      } else {
        editor.commands.setContent(plainTextDocument(body.text.trim()));
        editor.commands.focus("end");
        setAiMessage("AI suggestion applied to the body. Review it before saving or finalizing.");
      }
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "AI assistance could not complete this request.");
    } finally {
      setAiPending(false);
    }
  };

  return <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated shadow-[var(--shadow-xs)]">
    {!readOnly ? <div className="border-b border-border-subtle bg-surface-muted p-2">
      <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1" role="toolbar" aria-label="Text formatting">
        <ToolButton label="Undo" disabled={!editor.can().undo()} onPress={() => editor.chain().focus().undo().run()}><Undo2 className="size-4" /></ToolButton>
        <ToolButton label="Redo" disabled={!editor.can().redo()} onPress={() => editor.chain().focus().redo().run()}><Redo2 className="size-4" /></ToolButton>
        <span className="mx-1 h-6 w-px shrink-0 bg-border-subtle" />
        <ToolButton label="Bold" active={editor.isActive("bold")} onPress={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToolButton>
        <ToolButton label="Italic" active={editor.isActive("italic")} onPress={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToolButton>
        <ToolButton label="Underline" active={editor.isActive("underline")} onPress={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="size-4" /></ToolButton>
        <ToolButton label="Heading" active={editor.isActive("heading")} onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="size-4" /></ToolButton>
        <ToolButton label="Bulleted list" active={editor.isActive("bulletList")} onPress={() => editor.chain().focus().toggleBulletList().run()}><List className="size-4" /></ToolButton>
        <ToolButton label="Numbered list" active={editor.isActive("orderedList")} onPress={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolButton>
        <ToolButton label="Align left" active={editor.isActive({ textAlign: "left" })} onPress={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="size-4" /></ToolButton>
        <ToolButton label="Align centre" active={editor.isActive({ textAlign: "center" })} onPress={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="size-4" /></ToolButton>
        <ToolButton label="Align right" active={editor.isActive({ textAlign: "right" })} onPress={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="size-4" /></ToolButton>
        <ToolButton label="Justify" active={editor.isActive({ textAlign: "justify" })} onPress={() => editor.chain().focus().setTextAlign("justify").run()}><AlignJustify className="size-4" /></ToolButton>
        <ToolButton label="Insert 3 by 3 table" onPress={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Rows3 className="size-4" /></ToolButton>
        <ToolButton label="Add link" active={editor.isActive("link")} onPress={() => setLinkOpen((current) => !current)}><Link2 className="size-4" /></ToolButton>
        <ToolButton label="Use signature block" onPress={onSignature}><Signature className="size-4" /></ToolButton>
        <span className="mx-1 h-6 w-px shrink-0 bg-border-subtle" />
        <ToolButton label="AI assist" active={aiOpen} onPress={() => setAiOpen((current) => !current)}><Sparkles className="size-4" /></ToolButton>
      </div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <Picker ariaLabel="Approved font" value={String(editor.getAttributes("textStyle").fontFamily ?? "Aptos")} onChange={(font) => editor.chain().focus().setFontFamily(font).run()} placeholder="Approved font" options={CORRESPONDENCE_FONTS.map((font) => ({ value: font, label: font }))} />
        <Picker ariaLabel="Approved font size" value={String(editor.getAttributes("textStyle").fontSize ?? "11pt")} onChange={(fontSize) => editor.chain().focus().setFontSize(fontSize).run()} placeholder="Font size" options={CORRESPONDENCE_FONT_SIZES.map((size) => ({ value: size, label: size }))} />
      </div>
      {linkOpen ? <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-sm)] bg-surface-elevated p-2 sm:flex-row"><input autoFocus type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://example.org" aria-label="Link URL" className="min-h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-sm outline-none focus:ring-4 focus:ring-brand-soft" /><Button size="sm" onClick={setLink}>Apply link</Button><Button size="sm" variant="ghost" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkOpen(false); }}>Remove link</Button></div> : null}
      {aiOpen ? <div className="mt-2 rounded-[var(--radius-sm)] border border-brand/15 bg-[color:var(--brand-soft)]/35 p-3">
        <div className="flex items-start gap-2"><Sparkles className="mt-0.5 size-4 shrink-0 text-brand-strong" /><div><p className="text-xs font-semibold text-foreground">AI writing assist</p><p className="mt-0.5 text-[0.68rem] leading-5 text-muted-foreground">Select text to rewrite only that part. With no selection, actions apply to the full body. Existing text is sent to the configured AI provider only when you click an editing action; AI never saves or finalizes the document.</p></div></div>
        <textarea value={aiInstruction} onChange={(event) => setAiInstruction(event.target.value)} placeholder="Example: Draft a polite letter inviting parents to a Grade 11 academic meeting next Thursday at 17:30." className="mt-3 min-h-20 w-full resize-y rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-4 focus:ring-brand-soft" maxLength={3000} />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" loading={aiPending} disabled={aiPending} onClick={() => void runAi("draft")}><Sparkles className="size-3.5" />Draft</Button>
          <Button type="button" size="sm" variant="neutral" disabled={aiPending} onClick={() => void runAi("formalize")}>Improve & formalize</Button>
          <Button type="button" size="sm" variant="neutral" disabled={aiPending} onClick={() => void runAi("simplify")}>Simplify</Button>
          <Button type="button" size="sm" variant="neutral" disabled={aiPending} onClick={() => void runAi("proofread")}>Proofread</Button>
          <Button type="button" size="sm" variant="neutral" disabled={aiPending} onClick={() => void runAi("shorten")}>Shorten</Button>
        </div>
        {aiMessage ? <p className="mt-2 text-xs leading-5 text-muted-foreground" role="status">{aiMessage}</p> : null}
      </div> : null}
    </div> : null}
    <EditorContent editor={editor} />
    <style jsx global>{`
      .correspondence-prosemirror { min-height: 19rem; padding: 1.5rem; color: var(--foreground); font-family: Aptos, Arial, sans-serif; font-size: 11pt; line-height: 1.6; outline: none; }
      .correspondence-prosemirror:focus-visible { box-shadow: inset 0 0 0 3px var(--brand-soft); }
      .correspondence-prosemirror p { margin: 0 0 .75rem; }
      .correspondence-prosemirror h2 { margin: 1.25rem 0 .5rem; font-size: 16pt; font-weight: 650; }
      .correspondence-prosemirror h3 { margin: 1rem 0 .5rem; font-size: 14pt; font-weight: 650; }
      .correspondence-prosemirror ul, .correspondence-prosemirror ol { margin: .5rem 0 1rem 1.5rem; }
      .correspondence-prosemirror ul { list-style: disc; } .correspondence-prosemirror ol { list-style: decimal; }
      .correspondence-prosemirror table { width: 100%; border-collapse: collapse; margin: 1rem 0; table-layout: fixed; }
      .correspondence-prosemirror th, .correspondence-prosemirror td { border: 1px solid var(--border); padding: .5rem; vertical-align: top; }
      .correspondence-prosemirror th { background: var(--surface-muted); font-weight: 650; }
      @media (max-width: 640px) { .correspondence-prosemirror { min-height: 16rem; padding: 1rem; } }
    `}</style>
  </div>;
}

export function CorrespondenceEditor({ document }: { document: CorrespondenceDocument }) {
  const router = useRouter();
  const readOnly = document.status === "finalized";
  const [pending, startTransition] = useTransition();
  const [templateKey, setTemplateKey] = useState<CorrespondenceTemplateKey>(document.templateKey);
  const [documentDate, setDocumentDate] = useState(document.documentDate);
  const [recipient, setRecipient] = useState(document.recipient);
  const [attention, setAttention] = useState(document.attention);
  const [subject, setSubject] = useState(document.subject);
  const [bodySeed, setBodySeed] = useState(document.body);
  const bodyRef = useRef(document.body);
  const [closing, setClosing] = useState(document.closing);
  const [signatoryName, setSignatoryName] = useState(document.signatoryName);
  const [signatoryPosition, setSignatoryPosition] = useState(document.signatoryPosition);
  const [includeSignatureBlock, setIncludeSignatureBlock] = useState(document.includeSignatureBlock);
  const [attachmentsText, setAttachmentsText] = useState(document.attachments.join("\n"));
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDestination, setEmailDestination] = useState("");
  const attachments = useMemo(() => attachmentsText.split("\n").map((item) => item.trim()).filter(Boolean), [attachmentsText]);

  const payload = () => ({ documentId: document.id, templateKey, documentDate, recipient, attention, subject, body: JSON.stringify(bodyRef.current), closing, signatoryName, signatoryPosition, includeSignatureBlock, attachments });
  const save = async () => {
    const result = await saveCorrespondenceDraft(payload());
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    if (result.success) router.refresh();
    return result.success;
  };
  const preparePreview = async () => {
    if (readOnly) return true;
    return save();
  };
  const downloadPdf = () => {
    startTransition(async () => {
      if (!readOnly && !(await save())) return;
      window.location.href = `/api/official-documents/correspondence/${document.id}?format=pdf`;
    });
  };
  const shareFinalizedPdf = async () => {
    if (!readOnly) return;
    startTransition(async () => {
      try {
        const response = await fetch(`/api/official-documents/correspondence/${document.id}?format=pdf`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Unable to prepare the finalized PDF.");
        const blob = await response.blob();
        const filename = `${document.referenceNumber ?? "official-correspondence"}-r${document.revisionNumber}.pdf`;
        const file = new File([blob], filename, { type: "application/pdf" });

        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
          await navigator.share({
            title: document.subject || "Official correspondence",
            text: document.referenceNumber ? `Official correspondence ${document.referenceNumber}` : "Official correspondence",
            files: [file],
          });
          const recorded = await recordFinalizedCorrespondenceShare(document.id, "web_share_pdf");
          if (!recorded.success) toast.error(recorded.message);
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        const anchor = window.document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
        const recorded = await recordFinalizedCorrespondenceShare(document.id, "download_for_whatsapp");
        if (!recorded.success) toast.error(recorded.message);
        else toast.success("PDF downloaded. Attach it in WhatsApp using your device share flow.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error(error instanceof Error ? error.message : "Unable to share the finalized PDF.");
      }
    });
  };

  const sendFinalizedEmail = () => {
    startTransition(async () => {
      const result = await emailFinalizedCorrespondence(document.id, emailDestination);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setEmailOpen(false);
      setEmailDestination("");
    });
  };
  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="scolapro-section-title">{readOnly ? "Finalized correspondence" : "Correspondence editor"}</h2><p className="scolapro-section-description">{readOnly ? "This revision is frozen. Create a revision to make an auditable correction." : "Use the controlled editor to prepare an official document. Draft changes remain editable until finalization."}</p></div>
        <span className={`w-fit rounded-[var(--radius-xs)] px-2 py-1 text-xs font-medium ${readOnly ? "bg-success-soft text-[color:var(--success)]" : "bg-warning-soft text-[color:var(--warning)]"}`}>{readOnly ? `Finalized · ${document.referenceNumber}` : "Draft"}</span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Picker label="Template" value={templateKey} disabled={readOnly} onChange={(value) => { const next = value as CorrespondenceTemplateKey; setTemplateKey(next); const template = CORRESPONDENCE_TEMPLATES.find((item) => item.key === next); if (template && !subject.trim()) setSubject(template.subject); if (template) { const nextBody = templateContent(next); bodyRef.current = nextBody; setBodySeed(nextBody); } }} placeholder="Choose template" options={CORRESPONDENCE_TEMPLATES.map((item) => ({ value: item.key, label: item.label }))} />
        {readOnly ? <label className="min-w-0"><span className={labelClass}>Date</span><input disabled value={documentDate} className={inputClass} /></label> : <DateField label="Date" name="documentDate" value={documentDate} onChange={setDocumentDate} required />}
        <label className="min-w-0"><span className={labelClass}>Recipient / To</span><input disabled={readOnly} value={recipient} onChange={(event) => setRecipient(event.target.value)} className={inputClass} maxLength={500} /></label>
        <label className="min-w-0"><span className={labelClass}>Attention</span><input disabled={readOnly} value={attention} onChange={(event) => setAttention(event.target.value)} className={inputClass} maxLength={500} /></label>
        <label className="min-w-0 md:col-span-2"><span className={labelClass}>Subject / Re</span><input disabled={readOnly} value={subject} onChange={(event) => setSubject(event.target.value)} className={inputClass} maxLength={500} /></label>
      </div>
      <div className="mt-4"><p className={labelClass}>Body</p><div className="mt-1.5"><RichTextEditor key={templateKey} value={bodySeed} onChange={(value) => { bodyRef.current = value; }} readOnly={readOnly} onSignature={() => setIncludeSignatureBlock(true)} aiContext={{ subject, recipient, attention }} /></div></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label><span className={labelClass}>Closing</span><input disabled={readOnly} value={closing} onChange={(event) => setClosing(event.target.value)} className={inputClass} maxLength={200} /></label>
        <div className="md:col-span-2 grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Name</span><input disabled={readOnly} value={signatoryName} onChange={(event) => setSignatoryName(event.target.value)} className={inputClass} maxLength={200} /></label><label><span className={labelClass}>Position</span><input disabled={readOnly} value={signatoryPosition} onChange={(event) => setSignatoryPosition(event.target.value)} className={inputClass} maxLength={200} /></label></div>
        <div className="md:col-span-2"><CheckboxField name="signatureBlock" label="Include signature block" checked={includeSignatureBlock} onChange={(event) => setIncludeSignatureBlock(event.target.checked)} disabled={readOnly} /><p className="mt-1 text-[0.68rem] text-muted-foreground">Leave print-safe space for a physical signature above the name and position.</p></div>
        <label className="md:col-span-2"><span className={labelClass}>Attachments</span><textarea disabled={readOnly} value={attachmentsText} onChange={(event) => setAttachmentsText(event.target.value)} className={`${inputClass} min-h-24 py-2`} placeholder="One attachment reference per line" maxLength={4_000} /><span className="mt-1 block text-[0.68rem] text-muted-foreground">List up to 20 attachment names or references. This issue does not send or share files.</span></label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        {!readOnly ? <Button loading={pending} onClick={() => startTransition(async () => { await save(); })}><Save className="size-4" />{pending ? "Saving…" : "Save draft"}</Button> : null}
        <OfficialDocumentActions
          previewHref={`/api/official-documents/correspondence/${document.id}`}
          onPreview={preparePreview}
          onDownload={downloadPdf}
          disabled={pending}
        />
        {!readOnly ? <Button variant="success" loading={pending} onClick={() => startTransition(async () => { if (!(await save())) return; const result = await finalizeCorrespondenceDocument(document.id); if (result.success) toast.success(result.message); else toast.error(result.message); if (result.success) router.refresh(); })}><Signature className="size-4" />Finalize</Button> : <>
          <Button variant="neutral" disabled={pending} onClick={() => setEmailOpen(true)}><Mail className="size-4" />Email PDF</Button>
          <Button variant="neutral" disabled={pending} onClick={shareFinalizedPdf}><Share2 className="size-4" />Share / WhatsApp</Button>
          <Button onClick={() => setRevisionOpen(true)}><PenLine className="size-4" />Create revision</Button>
        </>}
      </div>
    </section>
    {emailOpen ? <div className="fixed inset-0 z-[150] grid place-items-center bg-[color:var(--foreground)]/15 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEmailOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="email-correspondence-title" className="w-full max-w-lg rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-5 shadow-[var(--shadow-md)]"><h2 id="email-correspondence-title" className="scolapro-section-title">Email finalized PDF</h2><p className="scolapro-section-description">Only the frozen finalized PDF is queued. The editable document is never sent.</p><label className="mt-4 block"><span className={labelClass}>Recipient email</span><input autoFocus type="email" value={emailDestination} onChange={(event) => setEmailDestination(event.target.value)} className={inputClass} maxLength={320} placeholder="recipient@example.com" /></label><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button><Button loading={pending} disabled={!emailDestination.trim()} onClick={sendFinalizedEmail}><Mail className="size-4" />Queue email</Button></div></section></div> : null}
    {revisionOpen ? <div className="fixed inset-0 z-[150] grid place-items-center bg-[color:var(--foreground)]/15 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setRevisionOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="revision-title" className="w-full max-w-lg rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-5 shadow-[var(--shadow-md)]"><h2 id="revision-title" className="scolapro-section-title">Create correspondence revision</h2><p className="scolapro-section-description">The finalized record stays unchanged. A new draft will preserve its lineage and revision reason.</p><label className="mt-4 block"><span className={labelClass}>Revision reason</span><textarea autoFocus value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} className={`${inputClass} min-h-24 py-2`} maxLength={500} /></label><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setRevisionOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => startTransition(async () => { const result = await reviseCorrespondenceDocument(document.id, revisionReason); if (!result.success || !result.documentId) { toast.error(result.message); return; } toast.success(result.message); router.push(`/correspondence/${result.documentId}`); })}>Create revision</Button></div></section></div> : null}
  </div>;
}
