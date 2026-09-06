"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Picker } from "@/components/ui/picker";
import { archiveConductCategory, saveConductCategory } from "./server/actions";
import { ConductDialog, ConductForm, buttonClass, fieldClass } from "./controls";
import type { ConductCategory, ConductDomain } from "./types";
const severities = ["routine", "moderate", "serious", "critical"].map(value => ({ value, label: value }));

function CategoryEditor({ schoolId, category, onSaved }: { schoolId: string; category?: ConductCategory; onSaved: () => void }) {
  const [domain, setDomain] = useState<ConductDomain>(category?.domain ?? "conduct");
  const [direction, setDirection] = useState(category?.direction ?? "negative");
  const [severity, setSeverity] = useState(category?.default_severity ?? "routine");
  const [active, setActive] = useState(category?.active === false ? "false" : "true");
  return <ConductForm action={saveConductCategory} onSaved={onSaved}>
    <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="categoryId" value={category?.id ?? ""} />
    <Picker label="Domain" name="domain" value={domain} onChange={v => setDomain(v as ConductDomain)} disabled={Boolean(category)} options={[{ value: "conduct", label: "Incidents" }, { value: "achievement", label: "Achievements" }]} placeholder="Domain" />
    {domain === "conduct" ? <Picker label="Direction" name="direction" value={direction} onChange={v => setDirection(v === "positive" ? "positive" : "negative")} options={[{ value: "positive", label: "Positive" }, { value: "negative", label: "Negative" }]} placeholder="Direction" /> : null}
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium">Code<input name="code" required maxLength={40} defaultValue={category?.code} className={fieldClass} /></label><label className="text-xs font-medium">Category name<input name="displayName" required maxLength={120} defaultValue={category?.display_name} className={fieldClass} /></label></div>
    {domain === "conduct" && direction === "negative" ? <Picker label="Default severity" name="severity" value={severity} onChange={setSeverity} options={severities} placeholder="Severity" /> : null}
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium">Points (optional policy value)<input name="points" type="number" step="1" defaultValue={category?.points ?? ""} className={fieldClass} /></label><label className="text-xs font-medium">Display order<input name="sortOrder" type="number" min="0" max="10000" step="1" required defaultValue={category?.sort_order ?? 100} className={fieldClass} /></label></div>
    <Picker label="Availability" name="active" value={active} onChange={setActive} options={[{ value: "true", label: "Active" }, { value: "false", label: "Archived" }]} placeholder="Availability" />
    <p className="text-xs text-muted-foreground">Changes apply to new entries. Recorded events keep their original category meaning.</p><button className={buttonClass}>Save category</button>
  </ConductForm>;
}
export function ConductCategorySettings({ schoolId, categories }: { schoolId: string; categories: ConductCategory[] }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<ConductCategory | "new" | null>(null);
  return <section id="conduct-categories" className="mt-5 rounded-[var(--radius-sm)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="scolapro-section-title">Conduct policy</h2><p className="scolapro-section-description">Configure incident and achievement categories for your school.</p></div><button className={buttonClass} onClick={() => setEditing("new")}>Add category</button></div>
    <button className="mt-4 flex min-h-10 w-full items-center justify-between gap-3 border-t border-border-subtle pt-3 text-left text-sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Configured categories · {categories.length}<ChevronDown aria-hidden="true" className={`size-4 motion-safe:transition-transform ${expanded ? "rotate-180" : ""}`} /></button>
    {expanded ? <div className="mt-3 space-y-3">{categories.length ? categories.map(c => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle py-3"><div><p className="scolapro-record-title">{c.display_name}</p><p className="text-xs text-muted-foreground">{c.code} · {c.domain === "conduct" ? `${c.direction} incident` : "Achievement"} · {c.active ? "Active" : "Archived"}</p></div><div className="flex gap-2"><button className={buttonClass} onClick={() => setEditing(c)}>Edit</button>{c.active ? <ConductForm action={archiveConductCategory}><input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="categoryId" value={c.id} /><button className={buttonClass}>Archive</button></ConductForm> : null}</div></div>) : <p className="text-sm text-muted-foreground">No categories configured. Add your school’s policy categories to enable recording.</p>}</div> : null}
    {editing ? <ConductDialog title={editing === "new" ? "Add category" : "Edit category"} onClose={() => setEditing(null)}><CategoryEditor schoolId={schoolId} category={editing === "new" ? undefined : editing} onSaved={() => setEditing(null)} /></ConductDialog> : null}
  </section>;
}
