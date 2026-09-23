"use client";

import { useMemo, useState, useTransition } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Download, Eye, Heading2, Italic, Link2,
  List, ListOrdered, Mail, PenLine, Printer, Redo2, Rows3, Save, Share2, Signature, Underline as UnderlineIcon, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { Tooltip } from "@/components/ui/tooltip";
import { finalizeCorrespondenceDocument, reviseCorrespondenceDocument, saveCorrespondenceDraft } from "@/features/correspondence/server/actions";
import { CORRESPONDENCE_FONTS, CORRESPONDENCE_FONT_SIZES, correspondenceBodyPlainText } from "@/features/correspondence/rich-text";
import { CORRESPONDENCE_TEMPLATES, templateContent, type CorrespondenceTemplateKey } from "@/features/correspondence/templates";
import type { CorrespondenceDocument } from "@/features/correspondence/types";
import { useRouter } from "next/navigation";

const inputClass = "mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70";
const labelClass = "text-xs font-medium text-foreground";

function ToolButton({ label, active = false, disabled = false, onPress, children }: { label: string; active?: boolean; disabled?: boolean; onPress: () => void; children: React.ReactNode }) {
  const button = <button type="button" aria-label={label} aria-pressed={active || undefined} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onPress} className={`grid size-9 shrink-0 place-items-center rounded-[var(--radius-xs)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 disabled:opacity-35 ${active ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"}`}>{children}</button>;
  return <Tooltip title={label}>{button}</Tooltip>;
}

function RichTextEditor({ value, onChange, readOnly, onSignature }: { value: CorrespondenceDocument["body"]; onChange: (value: CorrespondenceDocument["body"]) => void; readOnly: boolean; onSignature: () => void }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
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
      </div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <Picker ariaLabel="Approved font" value={String(editor.getAttributes("textStyle").fontFamily ?? "Aptos")} onChange={(font) => editor.chain().focus().setFontFamily(font).run()} placeholder="Approved font" options={CORRESPONDENCE_FONTS.map((font) => ({ value: font, label: font }))} />
        <Picker ariaLabel="Approved font size" value={String(editor.getAttributes("textStyle").fontSize ?? "11pt")} onChange={(fontSize) => editor.chain().focus().setFontSize(fontSize).run()} placeholder="Font size" options={CORRESPONDENCE_FONT_SIZES.map((size) => ({ value: size, label: size }))} />
      </div>
      {linkOpen ? <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius-sm)] bg-surface-elevated p-2 sm:flex-row"><input autoFocus type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://example.org" aria-label="Link URL" className="min-h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 text-sm outline-none focus:ring-4 focus:ring-brand-soft" /><Button size="sm" onClick={setLink}>Apply link</Button><Button size="sm" variant="ghost" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkOpen(false); }}>Remove link</Button></div> : null}
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
  const [body, setBody] = useState(document.body);
  const [closing, setClosing] = useState(document.closing);
  const [signatoryName, setSignatoryName] = useState(document.signatoryName);
  const [signatoryPosition, setSignatoryPosition] = useState(document.signatoryPosition);
  const [includeSignatureBlock, setIncludeSignatureBlock] = useState(document.includeSignatureBlock);
  const [attachmentsText, setAttachmentsText] = useState(document.attachments.join("\n"));
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const attachments = useMemo(() => attachmentsText.split("\n").map((item) => item.trim()).filter(Boolean), [attachmentsText]);

  const payload = () => ({ documentId: document.id, templateKey, documentDate, recipient, attention, subject, body: JSON.stringify(body), closing, signatoryName, signatoryPosition, includeSignatureBlock, attachments });
  const save = async () => {
    const result = await saveCorrespondenceDraft(payload());
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    if (result.success) router.refresh();
    return result.success;
  };
  const preview = (format: "html" | "print" | "pdf") => {
    const target = window.open("about:blank", format === "pdf" ? "_self" : "_blank");
    startTransition(async () => {
      if (!readOnly && !(await save())) { target?.close(); return; }
      const suffix = format === "pdf" ? "?format=pdf" : format === "print" ? "?print=1" : "";
      if (target) target.location.href = `/api/official-documents/correspondence/${document.id}${suffix}`;
    });
  };
  const email = () => {
    const content = `${recipient ? `To: ${recipient}\n\n` : ""}${correspondenceBodyPlainText(body)}\n\n${closing}\n${signatoryName}\n${signatoryPosition}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(content)}`;
  };
  const share = async () => {
    const data = { title: subject || "Official correspondence", text: correspondenceBodyPlainText(body), url: window.location.href };
    if (navigator.share) {
      try { await navigator.share(data); } catch (error) { if ((error as DOMException).name !== "AbortError") toast.error("The document could not be shared."); }
      return;
    }
    try { await navigator.clipboard.writeText(window.location.href); toast.success("Document link copied."); }
    catch { toast.error("Sharing is not available in this browser."); }
  };

  return <div className="space-y-5">
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="scolapro-section-title">{readOnly ? "Finalized correspondence" : "Correspondence editor"}</h2><p className="scolapro-section-description">{readOnly ? "This revision is frozen. Create a revision to make an auditable correction." : "Use the controlled editor to prepare an official document. Draft changes remain editable until finalization."}</p></div>
        <span className={`w-fit rounded-[var(--radius-xs)] px-2 py-1 text-xs font-medium ${readOnly ? "bg-success-soft text-[color:var(--success)]" : "bg-warning-soft text-[color:var(--warning)]"}`}>{readOnly ? `Finalized · ${document.referenceNumber}` : "Draft"}</span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Picker label="Template" value={templateKey} disabled={readOnly} onChange={(value) => { const next = value as CorrespondenceTemplateKey; setTemplateKey(next); const template = CORRESPONDENCE_TEMPLATES.find((item) => item.key === next); if (template && !subject.trim()) setSubject(template.subject); if (template) setBody(templateContent(next)); }} placeholder="Choose template" options={CORRESPONDENCE_TEMPLATES.map((item) => ({ value: item.key, label: item.label }))} />
        {readOnly ? <label className="min-w-0"><span className={labelClass}>Date</span><input disabled value={documentDate} className={inputClass} /></label> : <DateField label="Date" name="documentDate" value={documentDate} onChange={setDocumentDate} required />}
        <label className="min-w-0"><span className={labelClass}>Recipient / To</span><input disabled={readOnly} value={recipient} onChange={(event) => setRecipient(event.target.value)} className={inputClass} maxLength={500} /></label>
        <label className="min-w-0"><span className={labelClass}>Attention</span><input disabled={readOnly} value={attention} onChange={(event) => setAttention(event.target.value)} className={inputClass} maxLength={500} /></label>
        <label className="min-w-0 md:col-span-2"><span className={labelClass}>Subject / Re</span><input disabled={readOnly} value={subject} onChange={(event) => setSubject(event.target.value)} className={inputClass} maxLength={500} /></label>
      </div>
      <div className="mt-4"><p className={labelClass}>Body</p><div className="mt-1.5"><RichTextEditor value={body} onChange={setBody} readOnly={readOnly} onSignature={() => setIncludeSignatureBlock(true)} /></div></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label><span className={labelClass}>Closing</span><input disabled={readOnly} value={closing} onChange={(event) => setClosing(event.target.value)} className={inputClass} maxLength={200} /></label>
        <div className="md:col-span-2 grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Name</span><input disabled={readOnly} value={signatoryName} onChange={(event) => setSignatoryName(event.target.value)} className={inputClass} maxLength={200} /></label><label><span className={labelClass}>Position</span><input disabled={readOnly} value={signatoryPosition} onChange={(event) => setSignatoryPosition(event.target.value)} className={inputClass} maxLength={200} /></label></div>
        <div className="md:col-span-2"><CheckboxField name="signatureBlock" label="Include signature block" checked={includeSignatureBlock} onChange={(event) => setIncludeSignatureBlock(event.target.checked)} disabled={readOnly} /><p className="mt-1 text-[0.68rem] text-muted-foreground">Leave print-safe space for a physical signature above the name and position.</p></div>
        <label className="md:col-span-2"><span className={labelClass}>Attachments</span><textarea disabled={readOnly} value={attachmentsText} onChange={(event) => setAttachmentsText(event.target.value)} className={`${inputClass} min-h-24 py-2`} placeholder="One attachment reference per line" maxLength={4_000} /><span className="mt-1 block text-[0.68rem] text-muted-foreground">List up to 20 attachment names or references. This issue does not send or share files.</span></label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        {!readOnly ? <Button loading={pending} onClick={() => startTransition(async () => { await save(); })}><Save className="size-4" />{pending ? "Saving…" : "Save draft"}</Button> : null}
        <Button variant="neutral" disabled={pending} onClick={() => preview("html")}><Eye className="size-4" />Preview</Button>
        <Button variant="neutral" disabled={pending} onClick={() => preview("print")}><Printer className="size-4" />Print</Button>
        <Button variant="neutral" disabled={pending} onClick={() => preview("pdf")}><Download className="size-4" />PDF</Button>
        {readOnly ? <Button variant="neutral" disabled={pending} onClick={email}><Mail className="size-4" />Email</Button> : null}
        {readOnly ? <Button variant="neutral" disabled={pending} onClick={() => { void share(); }}><Share2 className="size-4" />Share</Button> : null}
        {!readOnly ? <Button variant="success" loading={pending} onClick={() => startTransition(async () => { if (!(await save())) return; const result = await finalizeCorrespondenceDocument(document.id); if (result.success) toast.success(result.message); else toast.error(result.message); if (result.success) router.refresh(); })}><Signature className="size-4" />Finalize</Button> : <Button onClick={() => setRevisionOpen(true)}><PenLine className="size-4" />Create revision</Button>}
      </div>
    </section>
    {revisionOpen ? <div className="fixed inset-0 z-[150] grid place-items-center bg-[color:var(--foreground)]/15 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setRevisionOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="revision-title" className="w-full max-w-lg rounded-[var(--radius-md)] border border-border-subtle bg-surface-elevated p-5 shadow-[var(--shadow-md)]"><h2 id="revision-title" className="scolapro-section-title">Create correspondence revision</h2><p className="scolapro-section-description">The finalized record stays unchanged. A new draft will preserve its lineage and revision reason.</p><label className="mt-4 block"><span className={labelClass}>Revision reason</span><textarea autoFocus value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} className={`${inputClass} min-h-24 py-2`} maxLength={500} /></label><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setRevisionOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => startTransition(async () => { const result = await reviseCorrespondenceDocument(document.id, revisionReason); if (!result.success || !result.documentId) { toast.error(result.message); return; } toast.success(result.message); router.push(`/correspondence/${result.documentId}`); })}>Create revision</Button></div></section></div> : null}
  </div>;
}
