"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Archive, Boxes, LibraryBig, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import { addLibraryCopies, saveLibraryTitle, type LibraryActionState } from "@/features/library/server/actions";
import type { LibraryGrade, LibrarySubject, LibraryTitle } from "@/features/library/server/queries";

const initialState: LibraryActionState = {};
const resourceTypes = [
  { value: "textbook", label: "Textbook" },
  { value: "library_book", label: "Library book" },
  { value: "teacher_resource", label: "Teacher resource" },
  { value: "device", label: "Device" },
  { value: "other", label: "Other" },
];
const titleStatuses = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];
const conditions = ["new", "good", "fair", "poor", "damaged", "lost"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
const availabilityOptions = ["available", "reserved", "repair", "lost", "withdrawn"].map((value) => ({ value, label: value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) }));

function TextField({ label, name, defaultValue, placeholder, required }: { label: string; name: string; defaultValue?: string | null; placeholder?: string; required?: boolean }) {
  return <label className="block text-xs font-medium leading-4">{label}<input name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} required={required} className="mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm outline-none transition focus:border-[color:var(--brand)]/45 focus:ring-4 focus:ring-[color:var(--brand-soft)]" /></label>;
}

export function CatalogManager({ schoolId, titles, subjects, grades }: { schoolId: string; titles: LibraryTitle[]; subjects: LibrarySubject[]; grades: LibraryGrade[] }) {
  const [titleState, titleAction, titlePending] = useActionState(saveLibraryTitle, initialState);
  const [copyState, copyAction, copyPending] = useActionState(addLibraryCopies, initialState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resourceType, setResourceType] = useState("textbook");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [status, setStatus] = useState("active");
  const [stockTitleId, setStockTitleId] = useState("");
  const [condition, setCondition] = useState("good");
  const [availability, setAvailability] = useState("available");
  const editing = useMemo(() => titles.find((item) => item.id === editingId) ?? null, [titles, editingId]);

  useEffect(() => {
    if (!titleState.message) return;
    titleState.success ? toast.success(titleState.message) : toast.error(titleState.message);
  }, [titleState]);
  useEffect(() => {
    if (!copyState.message) return;
    copyState.success ? toast.success(copyState.message) : toast.error(copyState.message);
  }, [copyState]);

  function edit(title: LibraryTitle) {
    setEditingId(title.id);
    setResourceType(title.resourceType);
    setSubjectId(title.subjectId ?? "");
    setGradeId(title.gradeId ?? "");
    setStatus(title.status);
  }

  function resetTitle() {
    setEditingId(null);
    setResourceType("textbook");
    setSubjectId("");
    setGradeId("");
    setStatus("active");
  }

  const subjectOptions = [{ value: "", label: "No subject / general resource" }, ...subjects.filter((item) => item.status === "active").map((item) => ({ value: item.id, label: item.name, helper: item.code }))];
  const latestGradeByCode = new Map<string, LibraryGrade>();
  for (const grade of grades) if (!latestGradeByCode.has(grade.code)) latestGradeByCode.set(grade.code, grade);
  const gradeOptions = [{ value: "", label: "No grade / general resource" }, ...[...latestGradeByCode.values()].map((item) => ({ value: item.id, label: item.name, helper: `${item.code} · ${item.academicYear}` }))];
  const activeTitles = titles.filter((title) => title.status !== "archived");

  return <section className="grid gap-5 xl:grid-cols-2">
    <form key={editing?.id ?? "new"} action={titleAction} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="titleId" value={editing?.id ?? ""} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="scolapro-section-title">{editing ? "Edit catalog title" : "Add catalog title"}</h2><p className="scolapro-section-description">Subject and grade links use the school’s configured academic records.</p></div>
        {editing ? <Button type="button" variant="ghost" size="sm" onClick={resetTitle}>New title</Button> : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Picker label="Resource type" name="resourceType" value={resourceType} onChange={setResourceType} options={resourceTypes} placeholder="Choose resource type" />
        <Picker label="Status" name="status" value={status} onChange={setStatus} options={titleStatuses} placeholder="Choose status" />
        <div className="sm:col-span-2"><TextField label="Title" name="title" defaultValue={editing?.title} placeholder="Resource title" required /></div>
        <TextField label="Author" name="author" defaultValue={editing?.author} />
        <TextField label="Publisher" name="publisher" defaultValue={editing?.publisher} />
        <TextField label="ISBN" name="isbn" defaultValue={editing?.isbn} />
        <TextField label="Edition" name="edition" defaultValue={editing?.edition} />
        <TextField label="Category" name="category" defaultValue={editing?.category} />
        <Picker label="Subject" name="subjectId" value={subjectId} onChange={setSubjectId} searchable options={subjectOptions} placeholder="No subject / general resource" />
        <Picker label="Grade" name="gradeId" value={gradeId} onChange={setGradeId} searchable options={gradeOptions} placeholder="No grade / general resource" />
      </div>
      {status === "archived" ? <p className="mt-3 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-xs text-[color:var(--warning)]"><Archive className="mr-1.5 inline size-3.5" aria-hidden="true" />Archiving is blocked while any copy of this title has an active loan.</p> : null}
      <div className="mt-4 flex justify-start sm:justify-end"><Button type="submit" loading={titlePending} disabled={titlePending}>{editing ? <><Pencil className="size-4" aria-hidden="true" />Save title</> : <><Plus className="size-4" aria-hidden="true" />Create title</>}</Button></div>
    </form>

    <form action={copyAction} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <input type="hidden" name="schoolId" value={schoolId} />
      <div><h2 className="scolapro-section-title">Add physical stock</h2><p className="scolapro-section-description">Add one copy or a numbered batch under one canonical title.</p></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Picker label="Catalog title" name="titleId" value={stockTitleId} onChange={setStockTitleId} searchable placeholder={activeTitles.length ? "Choose title" : "Create a title first"} options={activeTitles.map((title) => ({ value: title.id, label: title.title, helper: [title.subjectCode, title.gradeCode, title.edition].filter(Boolean).join(" · ") }))} /></div>
        <TextField label="Quantity" name="quantity" defaultValue="1" required />
        <TextField label="Location" name="locationLabel" placeholder="Shelf / room / store" />
        <TextField label="Barcode or batch prefix" name="barcodePrefix" placeholder="Optional" />
        <TextField label="Asset number or batch prefix" name="assetPrefix" placeholder="Optional" />
        <Picker label="Condition" name="condition" value={condition} onChange={setCondition} options={conditions} placeholder="Choose condition" />
        <Picker label="Availability" name="availability" value={availability} onChange={setAvailability} options={availabilityOptions} placeholder="Choose availability" />
        <div className="sm:col-span-2"><TextField label="Stock note" name="notes" placeholder="Optional acquisition or inventory note" /></div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">For batches, entered barcode/asset values are treated as prefixes and receive <code>-001</code>, <code>-002</code>… suffixes. Leave them blank for unlabelled stock.</p>
      <div className="mt-4 flex justify-start sm:justify-end"><Button type="submit" loading={copyPending} disabled={copyPending || !stockTitleId}><Boxes className="size-4" aria-hidden="true" />Add stock</Button></div>
    </form>

    {titles.length ? <div className="xl:col-span-2 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-start gap-3"><LibraryBig className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" /><div><h2 className="scolapro-section-title">Manage existing titles</h2><p className="scolapro-section-description">Edit supported metadata or safely inactivate/archive catalog entries.</p></div></div>
      <div className="mt-3 divide-y divide-border-subtle">{titles.map((title) => <div key={title.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="scolapro-record-title">{title.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{[title.subjectCode, title.gradeCode, title.edition, title.status].filter(Boolean).join(" · ")}</p></div><Button type="button" variant="neutral" size="sm" onClick={() => edit(title)}><Pencil className="size-3.5" aria-hidden="true" />Edit</Button></div>)}</div>
    </div> : null}
  </section>;
}
