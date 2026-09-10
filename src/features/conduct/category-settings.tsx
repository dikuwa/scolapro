"use client";
import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import { archiveConductCategory, saveConductCategory } from "./server/actions";
import { ConductDialog, ConductForm, useConductFormPending, fieldClass } from "./controls";
import type { ConductCategory, ConductDomain } from "./types";
const severities = ["routine", "moderate", "serious", "critical"].map(value => ({ value, label: value }));

function CategoryEditor({ schoolId, category, onSaved }: { schoolId: string; category?: ConductCategory; onSaved: () => void }) {
  const pending = useConductFormPending();
  const [domain, setDomain] = useState<ConductDomain>(category?.domain ?? "conduct");
  const [direction, setDirection] = useState(category?.direction ?? "negative");
  const [severity, setSeverity] = useState(category?.default_severity ?? "routine");
  const [active, setActive] = useState(category?.active === false ? "false" : "true");
  return (
    <ConductForm action={saveConductCategory} onSaved={onSaved}>
      <input type="hidden" name="schoolId" value={schoolId} /><input type="hidden" name="categoryId" value={category?.id ?? ""} />
      <Picker label="Domain" name="domain" value={domain} onChange={v => setDomain(v as ConductDomain)} disabled={Boolean(category)} options={[{ value: "conduct", label: "Incidents" }, { value: "achievement", label: "Achievements" }]} placeholder="Domain" />
      {domain === "conduct" ? <Picker label="Direction" name="direction" value={direction} onChange={v => setDirection(v === "positive" ? "positive" : "negative")} options={[{ value: "positive", label: "Positive" }, { value: "negative", label: "Negative" }]} placeholder="Direction" /> : null}
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium">Code<input name="code" required maxLength={40} defaultValue={category?.code} className={fieldClass} /></label><label className="text-xs font-medium">Category name<input name="displayName" required maxLength={120} defaultValue={category?.display_name} className={fieldClass} /></label></div>
      {domain === "conduct" && direction === "negative" ? <Picker label="Default severity" name="severity" value={severity} onChange={setSeverity} options={severities} placeholder="Severity" /> : null}
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium">Points (optional policy value)<input name="points" type="number" step="1" defaultValue={category?.points ?? ""} className={fieldClass} /></label><label className="text-xs font-medium">Display order<input name="sortOrder" type="number" min="0" max="10000" step="1" required defaultValue={category?.sort_order ?? 100} className={fieldClass} /></label></div>
      <Picker label="Availability" name="active" value={active} onChange={setActive} options={[{ value: "true", label: "Active" }, { value: "false", label: "Archived" }]} placeholder="Availability" />
      <p className="text-xs leading-5 text-muted-foreground">Changes apply to new entries. Recorded events keep their original category meaning.</p>
      <div className="flex justify-start sm:justify-end"><Button type="submit" loading={pending}>{category ? "Save category" : "Add category"}</Button></div>
    </ConductForm>
  );
}

export function ConductCategorySettings({ schoolId, categories }: { schoolId: string; categories: ConductCategory[] }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<ConductCategory | "new" | null>(null);
  return (
    <section id="conduct-categories" className="mt-5 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><h2 className="scolapro-section-title">Conduct policy</h2><p className="scolapro-section-description">Configure incident and achievement categories for your school.</p></div>
        <Button type="button" variant="soft" size="sm" className="self-start sm:self-auto" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden="true" />Add category</Button>
      </div>
      <button className="mt-4 flex min-h-10 w-full items-center justify-between gap-3 border-t border-border-subtle pt-3 text-left text-sm font-medium text-foreground transition-colors duration-[var(--motion-fast)] hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Configured categories · {categories.length}<ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground motion-safe:transition-transform ${expanded ? "rotate-180" : ""}`} /></button>
      {expanded ? (
        <div className="mt-3 divide-y divide-border-subtle">
          {categories.length ? categories.map(c => (
            <div key={c.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="scolapro-record-title">{c.display_name}</p><div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{c.code}</span><span aria-hidden="true">·</span><span>{c.domain === "conduct" ? `${c.direction} incident` : "Achievement"}</span><span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 font-medium text-foreground">{c.active ? "Active" : "Archived"}</span></div></div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button type="button" variant="neutral" size="sm" onClick={() => setEditing(c)}>Edit</Button>
                {c.active ? (
                  <ConductForm action={archiveConductCategory}>
                    <input type="hidden" name="schoolId" value={schoolId} />
                    <input type="hidden" name="categoryId" value={c.id} />
                    <Button type="submit" variant="neutral" size="sm">Archive</Button>
                  </ConductForm>
                ) : null}
              </div>
            </div>
          )) : <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-6 text-center"><p className="text-sm font-medium text-foreground">No categories configured</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Add your school’s policy categories to enable recording.</p></div>}
        </div>
      ) : null}
      {editing ? <ConductDialog title={editing === "new" ? "Add category" : "Edit category"} onClose={() => setEditing(null)}><CategoryEditor schoolId={schoolId} category={editing === "new" ? undefined : editing} onSaved={() => setEditing(null)} /></ConductDialog> : null}
    </section>
  );
}
