"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importLibraryCopies, importLibraryTitles, type LibraryActionState } from "@/features/library/server/actions";
import type { LibraryGrade, LibrarySubject, LibraryTitle } from "@/features/library/server/queries";

type ImportKind = "titles" | "copies";
type PreviewRow = { row: number; values: Record<string, string>; normalized?: Record<string, unknown>; errors: string[] };
const initialState: LibraryActionState = {};

function normalize(value: unknown) { return String(value ?? "").trim(); }
function key(value: string) { return value.trim().toLocaleLowerCase(); }

function downloadTemplate(kind: ImportKind) {
  const headers = kind === "titles"
    ? ["resource_type","title","author","publisher","isbn","subject_code","grade_code","edition","category","status"]
    : ["title_id","title","isbn","barcode","asset_number","condition","availability","location","notes"];
  const sample = kind === "titles"
    ? ["textbook","Example title","","","","SUBJECT-CODE","9","1st","Textbook","active"]
    : ["","Example title","","","","good","available","Shelf A",""];
  const csv = `${headers.join(",")}\n${sample.map((item) => `"${item.replaceAll('"', '""')}"`).join(",")}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = kind === "titles" ? "scolapro-library-catalog-template.csv" : "scolapro-library-stock-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readRows(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
}

function buildTitlePreview(rawRows: Record<string, unknown>[], subjects: LibrarySubject[], grades: LibraryGrade[], titles: LibraryTitle[]): PreviewRow[] {
  const subjectByCode = new Map(subjects.filter((item) => item.status === "active").map((item) => [key(item.code), item]));
  const gradeByCode = new Map<string, LibraryGrade>();
  for (const grade of [...grades].sort((a, b) => b.academicYear - a.academicYear)) if (!gradeByCode.has(key(grade.code))) gradeByCode.set(key(grade.code), grade);
  const existingIsbn = new Set(titles.map((item) => key(item.isbn ?? "")).filter(Boolean));
  const seenIsbn = new Set<string>();
  const seenIdentity = new Set<string>();
  return rawRows.map((raw, index) => {
    const values = Object.fromEntries(Object.entries(raw).map(([name, value]) => [name.trim().toLocaleLowerCase(), normalize(value)]));
    const errors: string[] = [];
    const resourceType = values.resource_type || "textbook";
    const title = values.title || "";
    const subjectCode = values.subject_code || "";
    const gradeCode = values.grade_code || "";
    const subject = subjectCode ? subjectByCode.get(key(subjectCode)) : null;
    const grade = gradeCode ? gradeByCode.get(key(gradeCode)) : null;
    if (!title) errors.push("Title is required.");
    if (!["textbook","library_book","teacher_resource","device","other"].includes(resourceType)) errors.push("Unknown resource type.");
    if (subjectCode && !subject) errors.push(`Subject '${subjectCode}' is not configured for this school.`);
    if (gradeCode && !grade) errors.push(`Grade '${gradeCode}' is not configured for this school.`);
    if (values.status && !["active","inactive","archived"].includes(values.status)) errors.push("Unknown title status.");
    const isbnKey = key(values.isbn || "");
    if (isbnKey && existingIsbn.has(isbnKey)) errors.push("ISBN already exists in this school catalog.");
    if (isbnKey && seenIsbn.has(isbnKey)) errors.push("Duplicate ISBN in this file.");
    if (isbnKey) seenIsbn.add(isbnKey);
    const identity = [key(title), key(values.edition || ""), subject?.id ?? "", grade?.id ?? ""].join("|");
    if (title && seenIdentity.has(identity)) errors.push("Duplicate title/edition/subject/grade row in this file.");
    if (title) seenIdentity.add(identity);
    return {
      row: index + 2,
      values,
      normalized: {
        resource_type: resourceType,
        title,
        author: values.author || null,
        publisher: values.publisher || null,
        isbn: values.isbn || null,
        subject_id: subject?.id ?? null,
        grade_id: grade?.id ?? null,
        edition: values.edition || null,
        category: values.category || null,
        status: values.status || "active",
      },
      errors,
    };
  });
}

function buildCopyPreview(rawRows: Record<string, unknown>[], titles: LibraryTitle[], existingBarcodes: Set<string>, existingAssets: Set<string>): PreviewRow[] {
  const titleById = new Map(titles.map((item) => [item.id, item]));
  const titleByIsbn = new Map(titles.filter((item) => item.isbn).map((item) => [key(item.isbn!), item]));
  const titleNameGroups = new Map<string, LibraryTitle[]>();
  for (const title of titles) titleNameGroups.set(key(title.title), [...(titleNameGroups.get(key(title.title)) ?? []), title]);
  const seenBarcodes = new Set<string>();
  const seenAssets = new Set<string>();
  return rawRows.map((raw, index) => {
    const values = Object.fromEntries(Object.entries(raw).map(([name, value]) => [name.trim().toLocaleLowerCase(), normalize(value)]));
    const errors: string[] = [];
    const explicitId = values.title_id || "";
    const isbn = values.isbn || "";
    const name = values.title || "";
    let title = explicitId ? titleById.get(explicitId) : undefined;
    if (!title && isbn) title = titleByIsbn.get(key(isbn));
    if (!title && name) {
      const matches = titleNameGroups.get(key(name)) ?? [];
      if (matches.length === 1) title = matches[0];
      else if (matches.length > 1) errors.push("Title name is ambiguous; provide title_id or ISBN.");
    }
    if (!title) errors.push("Catalog title could not be resolved.");
    const condition = values.condition || "good";
    const availability = values.availability || "available";
    if (!["new","good","fair","poor","damaged","lost"].includes(condition)) errors.push("Unknown condition.");
    if (!["available","reserved","repair","lost","withdrawn"].includes(availability)) errors.push("Unknown availability.");
    if ((condition === "lost") !== (availability === "lost")) errors.push("Lost condition and availability must be used together.");
    const barcode = key(values.barcode || "");
    const asset = key(values.asset_number || "");
    if (barcode && (existingBarcodes.has(barcode) || seenBarcodes.has(barcode))) errors.push("Duplicate barcode.");
    if (asset && (existingAssets.has(asset) || seenAssets.has(asset))) errors.push("Duplicate asset number.");
    if (barcode) seenBarcodes.add(barcode);
    if (asset) seenAssets.add(asset);
    return {
      row: index + 2,
      values,
      normalized: {
        title_id: title?.id ?? "",
        barcode: values.barcode || null,
        asset_number: values.asset_number || null,
        condition,
        availability,
        location_label: values.location || values.location_label || null,
        notes: values.notes || null,
      },
      errors,
    };
  });
}

export function LibraryImport({ schoolId, titles, subjects, grades, existingBarcodes, existingAssets }: { schoolId: string; titles: LibraryTitle[]; subjects: LibrarySubject[]; grades: LibraryGrade[]; existingBarcodes: string[]; existingAssets: string[] }) {
  const [kind, setKind] = useState<ImportKind>("titles");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [titleState, titleAction, titlePending] = useActionState(importLibraryTitles, initialState);
  const [copyState, copyAction, copyPending] = useActionState(importLibraryCopies, initialState);
  const inputRef = useRef<HTMLInputElement>(null);
  const state = kind === "titles" ? titleState : copyState;
  const action = kind === "titles" ? titleAction : copyAction;
  const pending = kind === "titles" ? titlePending : copyPending;
  const errorCount = preview.reduce((sum, row) => sum + (row.errors.length ? 1 : 0), 0);
  const normalizedRows = preview.filter((row) => !row.errors.length).map((row) => row.normalized);

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);

  async function handleFile(file?: File) {
    if (!file) return;
    setParsing(true);
    setFileName(file.name);
    try {
      const rows = await readRows(file);
      const next = kind === "titles"
        ? buildTitlePreview(rows, subjects, grades, titles)
        : buildCopyPreview(rows, titles, new Set(existingBarcodes.map(key)), new Set(existingAssets.map(key)));
      setPreview(next);
      if (!next.length) toast.error("The spreadsheet contains no data rows.");
    } catch {
      setPreview([]);
      toast.error("The spreadsheet could not be read. Use the CSV/XLSX template and try again.");
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function switchKind(next: ImportKind) { setKind(next); setPreview([]); setFileName(""); }

  return <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><h2 className="scolapro-section-title">Bulk import</h2><p className="scolapro-section-description">Upload CSV or XLSX, validate mappings, preview row errors, then confirm once.</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant={kind === "titles" ? "soft" : "neutral"} size="sm" onClick={() => switchKind("titles")}>Catalog titles</Button><Button type="button" variant={kind === "copies" ? "soft" : "neutral"} size="sm" onClick={() => switchKind("copies")}>Physical copies</Button></div>
    </div>
    <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold">{kind === "titles" ? "Catalog template" : "Stock template"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Unknown subject/grade/title mappings are rejected. Nothing is imported until confirmation.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="neutral" size="sm" onClick={() => downloadTemplate(kind)}><Download className="size-4" aria-hidden="true" />Template</Button>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={(event) => handleFile(event.target.files?.[0])} />
          <Button type="button" variant="soft" size="sm" loading={parsing} onClick={() => inputRef.current?.click()}><Upload className="size-4" aria-hidden="true" />{parsing ? "Reading…" : "Upload"}</Button>
        </div>
      </div>
      {fileName ? <p className="mt-3 text-xs text-muted-foreground"><FileSpreadsheet className="mr-1.5 inline size-3.5" aria-hidden="true" />{fileName} · {preview.length} rows · {errorCount} with errors</p> : null}
    </div>

    {preview.length ? <>
      <div className="mt-4 overflow-x-auto rounded-[var(--radius-sm)] border border-border-subtle">
        <table className="min-w-full text-left text-xs"><thead className="bg-surface-muted text-muted-foreground"><tr><th className="px-3 py-2.5 font-semibold">Row</th><th className="px-3 py-2.5 font-semibold">Record</th><th className="px-3 py-2.5 font-semibold">Mapping</th><th className="px-3 py-2.5 font-semibold">Validation</th></tr></thead><tbody className="divide-y divide-border-subtle">{preview.slice(0, 100).map((row) => <tr key={row.row}><td className="px-3 py-2.5 align-top">{row.row}</td><td className="px-3 py-2.5 align-top"><p className="font-medium text-foreground">{row.values.title || row.values.barcode || row.values.asset_number || "Untitled row"}</p><p className="mt-0.5 text-muted-foreground">{kind === "titles" ? [row.values.isbn, row.values.subject_code, row.values.grade_code].filter(Boolean).join(" · ") : [row.values.isbn, row.values.location || row.values.location_label].filter(Boolean).join(" · ")}</p></td><td className="px-3 py-2.5 align-top text-muted-foreground">{row.normalized ? "Resolved" : "—"}</td><td className="px-3 py-2.5 align-top">{row.errors.length ? <ul className="space-y-1 text-[color:var(--danger)]">{row.errors.map((error) => <li key={error}>{error}</li>)}</ul> : <span className="font-medium text-[color:var(--success)]">Ready</span>}</td></tr>)}</tbody></table>
      </div>
      {preview.length > 100 ? <p className="mt-2 text-xs text-muted-foreground">Showing first 100 rows of {preview.length}; all rows will be validated for confirmation.</p> : null}
      <form action={action} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="rowsJson" value={JSON.stringify(normalizedRows)} />
        <p className="text-xs text-muted-foreground">{errorCount ? "Resolve every row error before importing." : `${normalizedRows.length} rows are ready. The server validates school mappings again before commit.`}</p>
        <Button type="submit" loading={pending} disabled={pending || Boolean(errorCount) || !normalizedRows.length}>{pending ? "Importing…" : `Confirm ${kind === "titles" ? "catalog" : "stock"} import`}</Button>
      </form>
    </> : null}
  </section>;
}
