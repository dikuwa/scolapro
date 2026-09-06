"use client";

import { useMemo, useState } from "react";
import { Download, ListFilter, Printer, Search, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Picker } from "@/components/ui/picker";
import type { ClassListColumn, ClassListColumnKey, ClassListRow } from "@/features/reporting/class-list-types";

type Option = { id: string; display_name: string };
type RegisterClass = Option & { grade_id: string };
type Cycle = { id: string; display_name: string; status: string };

function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function valueFor(row: ClassListRow, key: ClassListColumnKey, cycleId: string) {
  if (key === "candidateNumber") return cycleId ? row.candidateNumbers[cycleId] ?? "—" : "—";
  return row[key];
}

export function ClassListWorkspace({
  academicYear,
  schoolName,
  years,
  grades,
  classes,
  cycles,
  rows,
  availableColumns,
}: {
  academicYear: number;
  schoolName: string;
  years: number[];
  grades: Option[];
  classes: RegisterClass[];
  cycles: Cycle[];
  rows: ClassListRow[];
  availableColumns: ClassListColumn[];
}) {
  const router = useRouter();
  const [gradeId, setGradeId] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("current");
  const [query, setQuery] = useState("");
  const [cycleId, setCycleId] = useState(cycles[0]?.id ?? "");
  const initialColumns = availableColumns.filter((column) => ["learner", "admissionNumber", "grade", "registerClass"].includes(column.key)).map((column) => column.key);
  const [selectedColumns, setSelectedColumns] = useState<ClassListColumnKey[]>(initialColumns);

  const visibleClasses = useMemo(() => gradeId ? classes.filter((item) => item.grade_id === gradeId) : classes, [classes, gradeId]);
  const selected = availableColumns.filter((column) => selectedColumns.includes(column.key));
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (gradeId && row.gradeId !== gradeId) return false;
      if (classId && row.registerClassId !== classId) return false;
      if (status !== "all" && row.status !== status) return false;
      return !normalized || [row.learner, row.admissionNumber, row.grade, row.registerClass].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [classId, gradeId, query, rows, status]);

  function toggleColumn(key: ClassListColumnKey) {
    setSelectedColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function downloadCsv() {
    const lines = [selected.map((column) => csvCell(column.label)).join(",")];
    for (const row of filteredRows) lines.push(selected.map((column) => csvCell(String(valueFor(row, column.key, cycleId)))).join(","));
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `class-list-${academicYear}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function printList() {
    const scope = [String(academicYear), grades.find((grade) => grade.id === gradeId)?.display_name, classes.find((item) => item.id === classId)?.display_name].filter(Boolean).join(" · ");
    const headings = selected.map((column) => `<th>${html(column.label)}</th>`).join("");
    const body = filteredRows.map((row) => `<tr>${selected.map((column) => `<td>${html(String(valueFor(row, column.key, cycleId)))}</td>`).join("")}</tr>`).join("");
    const documentHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${html(schoolName)} class list</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;color:CanvasText;background:Canvas;font:11px/1.4 Arial,sans-serif}h1{margin:0;font-size:18px}p{margin:4px 0 16px;color:GrayText}table{width:100%;border-collapse:collapse}th,td{padding:6px;text-align:left;vertical-align:top;border-bottom:1px solid color-mix(in srgb,CanvasText 18%,transparent)}th{font-size:9px;text-transform:uppercase;letter-spacing:.04em}@media print{body{print-color-adjust:exact}}</style></head><body><h1>${html(schoolName)} class list</h1><p>${html(scope)} · ${filteredRows.length} learners</p><table><thead><tr>${headings}</tr></thead><tbody>${body}</tbody></table><script>window.addEventListener("load",()=>window.print());<\/script></body></html>`;
    const url = URL.createObjectURL(new Blob([documentHtml], { type: "text/html" }));
    const printWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (printWindow) window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    else URL.revokeObjectURL(url);
  }

  return <div className="space-y-5">
    <section className="print:hidden rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="mb-4 flex items-start gap-3"><span className="scolapro-tone-sky grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><ListFilter className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">List configuration</h2><p className="scolapro-section-description">Choose the learner scope and include only the fields needed for this list.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Picker label="Academic year" name="academicYear" value={String(academicYear)} onChange={(value) => router.push(`/reports/class-lists?year=${encodeURIComponent(value)}`)} placeholder="Choose year" options={(years.length ? years : [academicYear]).map((year) => ({ value: String(year), label: String(year) }))} />
        <Picker label="Grade" name="grade" value={gradeId} onChange={(value) => { setGradeId(value); setClassId(""); }} placeholder="All grades" options={[{ value: "", label: "All grades" }, ...grades.map((grade) => ({ value: grade.id, label: grade.display_name }))]} />
        <Picker label="Class" name="class" value={classId} onChange={setClassId} placeholder="All classes" options={[{ value: "", label: "All classes" }, ...visibleClasses.map((item) => ({ value: item.id, label: item.display_name }))]} />
        <Picker label="Enrolment status" name="status" value={status} onChange={setStatus} placeholder="Choose status" options={[{ value: "current", label: "Current learners" }, { value: "all", label: "All statuses" }, { value: "transferred", label: "Transferred" }, { value: "left", label: "Left" }, { value: "completed", label: "Completed" }, { value: "withdrawn", label: "Withdrawn" }]} />
        {availableColumns.some((column) => column.key === "candidateNumber") ? <Picker label="Exam cycle" name="cycle" value={cycleId} onChange={setCycleId} placeholder="Choose cycle" options={cycles.map((cycle) => ({ value: cycle.id, label: cycle.display_name, helper: cycle.status }))} /> : null}
      </div>
      <label className="mt-3 block text-xs font-medium" htmlFor="class-list-search">Search learners</label>
      <div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input id="class-list-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, admission number, grade or class" className="min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated py-2 pl-9 pr-3 text-sm outline-none transition duration-[var(--motion-fast)] placeholder:text-muted-foreground focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)]" /></div>
      <fieldset className="mt-4"><legend className="text-xs font-medium">Columns</legend><div className="mt-2 flex flex-wrap gap-2">{availableColumns.map((column) => { const active = selectedColumns.includes(column.key); return <button key={column.key} type="button" aria-pressed={active} onClick={() => toggleColumn(column.key)} className={`min-h-9 rounded-[var(--radius-xs)] border px-3 text-xs font-medium transition duration-[var(--motion-fast)] ${active ? "border-[color:var(--brand)]/30 bg-brand-soft text-brand-strong" : "border-border-subtle bg-surface-elevated text-muted-foreground hover:text-foreground"}`}>{column.label}</button>; })}</div></fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" onClick={printList} disabled={!filteredRows.length || !selected.length} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-medium text-white disabled:opacity-55"><Printer className="size-4" aria-hidden="true" />Print list</button><button type="button" onClick={downloadCsv} disabled={!filteredRows.length || !selected.length} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-4 text-sm font-medium disabled:opacity-55"><Download className="size-4" aria-hidden="true" />Download CSV</button><p className="text-xs text-muted-foreground">{filteredRows.length} learner{filteredRows.length === 1 ? "" : "s"} · {selected.length} column{selected.length === 1 ? "" : "s"}</p></div>
    </section>

    <section className="overflow-hidden rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-xs)] print:overflow-visible print:rounded-none print:shadow-none">
      <div className="border-b border-border-subtle px-4 py-4 sm:px-5 print:px-0"><h2 className="scolapro-section-title">{schoolName} class list</h2><p className="scolapro-section-description">Academic year {academicYear}{gradeId ? ` · ${grades.find((grade) => grade.id === gradeId)?.display_name ?? ""}` : ""}{classId ? ` · ${classes.find((item) => item.id === classId)?.display_name ?? ""}` : ""}</p></div>
      {!selected.length ? <div className="px-4 py-10 text-center"><p className="text-sm font-medium">Choose at least one column</p><p className="mt-1 text-xs text-muted-foreground">Selected fields will appear in the preview and export.</p></div> : filteredRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-max border-collapse text-left text-xs"><thead><tr className="bg-surface-muted">{selected.map((column) => <th key={column.key} scope="col" className="border-b border-border-subtle px-3 py-2.5 font-semibold text-muted-foreground">{column.label}</th>)}</tr></thead><tbody>{filteredRows.map((row) => <tr key={row.enrolmentId} className="border-b border-border-subtle last:border-b-0 hover:bg-surface-muted/60">{selected.map((column) => <td key={column.key} className="max-w-xs px-3 py-2.5 align-top">{String(valueFor(row, column.key, cycleId))}</td>)}</tr>)}</tbody></table></div> : <div className="px-4 py-10 text-center"><UsersRound className="mx-auto size-6 text-muted-foreground" aria-hidden="true" /><p className="mt-2 text-sm font-medium">No learners match this list</p><p className="mt-1 text-xs text-muted-foreground">Adjust the class, status or search filters.</p></div>}
    </section>
  </div>;
}
