"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LockKeyhole, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import {
  activateSchoolGradingScale,
  createSchoolGradingScale,
  replaceSchoolGradingScaleDraftBands,
  type GradingBandInput,
  type GradingScaleActionState,
  type SchoolGradingScale,
} from "@/features/assessment/server/school-grading-scales";

const initialState: GradingScaleActionState = { message: "" };
type BandDraft = { id: string; minimum: string; maximum: string; symbol: string; classification: "pass" | "fail" | "neutral" };
let nextBandId = 0;
function newBand(): BandDraft {
  nextBandId += 1;
  return { id: `draft-${nextBandId}`, minimum: "", maximum: "", symbol: "", classification: "neutral" };
}
const classifications = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "neutral", label: "Neutral" },
];

const control = "scolapro-control-surface min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground";
function BandFields({ bands, setBands }: { bands: BandDraft[]; setBands: (bands: BandDraft[]) => void }) {
  function update(id: string, field: keyof BandDraft, value: string) {
    setBands(bands.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold text-foreground">Explicit grading bands</p>
      <Button type="button" variant="neutral" size="sm" disabled={bands.length >= 30} onClick={() => setBands([...bands, newBand()])}><Plus className="size-3.5" />Add band</Button>
    </div>
    {bands.map((band, index) => <div key={band.id} className="grid gap-2 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted p-3 sm:grid-cols-[1fr_1fr_1fr_1.2fr_auto] sm:items-end">
      <label className="space-y-1 text-xs font-medium">Minimum
        <input className={control} type="text" inputMode="decimal" value={band.minimum} onChange={(e) => update(band.id, "minimum", e.target.value)} aria-label={`Band ${index + 1} minimum`} placeholder="e.g. 0" />
      </label>
      <label className="space-y-1 text-xs font-medium">Maximum
        <input className={control} type="text" inputMode="decimal" value={band.maximum} onChange={(e) => update(band.id, "maximum", e.target.value)} aria-label={`Band ${index + 1} maximum`} placeholder="e.g. 49" />
      </label>
      <label className="space-y-1 text-xs font-medium">Symbol
        <input className={control} type="text" value={band.symbol} onChange={(e) => update(band.id, "symbol", e.target.value)} aria-label={`Band ${index + 1} symbol`} maxLength={12} placeholder="School symbol" />
      </label>
      <Picker label="Classification" value={band.classification} onChange={(value) => update(band.id, "classification", value)} options={classifications} placeholder="Choose" />
      <Button type="button" size="sm" variant="neutral" disabled={bands.length <= 1} onClick={() => setBands(bands.filter((item) => item.id !== band.id))}><Trash2 className="size-3.5" />Remove</Button>
    </div>)}
  </div>;
}

function validBands(bands: BandDraft[]): GradingBandInput[] | null {
  const rows: GradingBandInput[] = [];
  for (const band of bands) {
    if (!band.minimum.trim() || !band.maximum.trim() || !band.symbol.trim()) return null;
    const minimum = Number(band.minimum);
    const maximum = Number(band.maximum);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)
        || minimum < 0 || maximum > 100 || maximum < minimum) return null;
    rows.push({ minimum, maximum, symbol: band.symbol.trim(), classification: band.classification });
  }
  return rows;
}

function CreateScale() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createSchoolGradingScale, initialState);
  const [key, setKey] = useState("");
  const [version, setVersion] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [precision, setPrecision] = useState("0");
  const [bands, setBands] = useState<BandDraft[]>([newBand()]);
  const converted = validBands(bands);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) { toast.success(state.message); router.refresh(); }
    else toast.error(state.message);
  }, [router, state]);

  return <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
    <h2 className="scolapro-section-title">Create a draft school scale</h2>
    <p className="scolapro-section-description">No symbols, cutoffs or national grading rules are supplied automatically. Enter only school-authorized values. A draft cannot be used for official approval until separately activated.</p>
    <form action={action} className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium">Scale key
          <input className={control} name="key" value={key} onChange={(e) => setKey(e.target.value)} maxLength={80} placeholder="School-specific key" required />
        </label>
        <label className="space-y-1 text-xs font-medium">Version
          <input className={control} name="version" value={version} onChange={(e) => setVersion(e.target.value)} maxLength={40} placeholder="e.g. 2026-v1" required />
        </label>
        <label className="space-y-1 text-xs font-medium">Display name
          <input className={control} name="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={160} placeholder="School approval scale" required />
        </label>
        <DateField label="Effective from" name="effectiveFrom" value={effectiveFrom} onChange={setEffectiveFrom} required />
        <DateField label="Effective to (optional)" name="effectiveTo" value={effectiveTo} onChange={setEffectiveTo} />
      </div>
      <div className="max-w-[16rem]">
        <Picker label="Decimal places" name="precision" value={precision} onChange={setPrecision} placeholder="Precision" options={[0, 1, 2, 3, 4].map((item) => ({ value: String(item), label: String(item) }))} />
      </div>
      <BandFields bands={bands} setBands={setBands} />
      <input type="hidden" name="bands" value={JSON.stringify(converted ?? [])} />
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={!key || !version || !displayName || !effectiveFrom || (Boolean(effectiveTo) && effectiveTo < effectiveFrom) || !converted}><Plus className="size-4" />Save draft scale</Button>
      </div>
    </form>
  </section>;
}

function DraftScaleActions({ scale }: { scale: SchoolGradingScale }) {
  const router = useRouter();
  const [bands, setBands] = useState<BandDraft[]>(scale.bands.map((item) => ({
    id: item.id, minimum: String(item.minimum), maximum: String(item.maximum),
    symbol: item.symbol, classification: item.classification,
  })));
  const [editState, editAction, editPending] = useActionState(replaceSchoolGradingScaleDraftBands, initialState);
  const [activateState, activateAction, activatePending] = useActionState(activateSchoolGradingScale, initialState);
  const [confirmed, setConfirmed] = useState(false);
  const converted = validBands(bands);
  useEffect(() => {
    const state = activateState.message ? activateState : editState;
    if (!state.message) return;
    if (state.success) { toast.success(state.message); router.refresh(); }
    else toast.error(state.message);
  }, [activateState, editState, router]);

  return <div className="mt-4 space-y-4 border-t border-border-subtle pt-4">
    <form action={editAction} className="space-y-3">
      <input type="hidden" name="scaleId" value={scale.id} />
      <input type="hidden" name="bands" value={JSON.stringify(converted ?? [])} />
      <BandFields bands={bands} setBands={setBands} />
      <div className="flex justify-end"><Button type="submit" size="sm" variant="neutral" loading={editPending} disabled={!converted}>Save draft bands</Button></div>
    </form>
    <form action={activateAction} className="flex flex-col gap-3 rounded-[var(--radius-sm)] bg-surface-muted p-3 sm:flex-row sm:items-center sm:justify-between">
      <input type="hidden" name="scaleId" value={scale.id} />
      <input type="hidden" name="confirmed" value={confirmed ? "yes" : "no"} />
      <CheckboxField label="I confirm this scale covers 0–100 with the school's approved symbols and precision. Activation freezes this version." checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <Button type="submit" size="sm" loading={activatePending} disabled={!confirmed || editPending}><LockKeyhole className="size-3.5" />Activate and freeze</Button>
    </form>
  </div>;
}

export function SchoolGradingScalesView({ scales }: { scales: SchoolGradingScale[] }) {
  return <div className="space-y-5">
    <section className="grid gap-3 rounded-[var(--radius-md)] bg-surface-muted p-4 sm:grid-cols-3">
      <div><p className="text-xs text-muted-foreground">School scale versions</p><p className="mt-1 text-xl font-semibold">{scales.length}</p></div>
      <div><p className="text-xs text-muted-foreground">Active versions</p><p className="mt-1 text-xl font-semibold">{scales.filter((row) => row.status === "active").length}</p></div>
      <div><p className="text-xs text-muted-foreground">Drafts awaiting review</p><p className="mt-1 text-xl font-semibold">{scales.filter((row) => row.status === "draft").length}</p></div>
    </section>
    <CreateScale />
    <section className="space-y-3">
      <h2 className="scolapro-section-title">Version history</h2>
      {scales.length ? scales.map((scale) => <article key={scale.id} className="rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="font-semibold text-foreground">{scale.displayName}</p><p className="mt-1 text-xs text-muted-foreground">{scale.key} · {scale.version} · Effective {scale.effectiveFrom} · {scale.decimalPlaces} decimal places</p></div>
          <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1 text-xs font-semibold capitalize text-foreground">{scale.status}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">{scale.bands.map((band) => <span key={band.id} className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-xs">{band.minimum}–{band.maximum}: <strong>{band.symbol}</strong> ({band.classification})</span>)}</div>
        {scale.status === "draft" ? <DraftScaleActions scale={scale} /> : <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" />This version is frozen. Create a new version for future grading changes.</p>}
      </article>) : <p className="rounded-[var(--radius-sm)] bg-surface-muted p-5 text-sm text-muted-foreground">No grading scales configured. Create a draft and enter approved school values.</p>}
    </section>
  </div>;
}
