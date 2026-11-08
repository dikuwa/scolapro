"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImagePlus, LoaderCircle, Save, School, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { formFieldLabelClass } from "@/components/ui/form-field-layout";
import { Picker } from "@/components/ui/picker";
import { ConfigurationCard } from "@/components/ui/configuration-card";
import {
  saveReportCardSchoolSettings,
  saveReportCardSubjectSetting,
  saveUploadedSchoolLogo,
  type ReportCardSettingsState,
} from "@/features/reporting/server/settings-actions";
import type { ReportCardSchoolSettings, ReportCardSubjectSetting } from "@/features/reporting/server/settings";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const initialState: ReportCardSettingsState = {};
const fieldClass = "min-h-10 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 text-sm text-foreground shadow-[var(--shadow-xs)] outline-none transition duration-[var(--motion-base)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-border focus:border-[color:var(--brand)]/50 focus:ring-4 focus:ring-[color:var(--brand-soft)]";
const allowedLogoTypes = new Set(["image/jpeg", "image/png"]);
const maxLogoBytes = 5 * 1024 * 1024;

function logoExtension(type: string) {
  return type === "image/png" ? "png" : "jpg";
}

function logoUploadFailureMessage(error: unknown) {
  const detail = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  return detail.trim() ? `School logo upload failed: ${detail.trim()}` : "School logo upload failed.";
}

function Toggle({ name, defaultChecked, label, description }: { name: string; defaultChecked: boolean; label: string; description: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3">
      <Checkbox name={name} defaultChecked={defaultChecked} label={label} />
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function SubjectRule({ schoolId, subject }: { schoolId: string; subject: ReportCardSubjectSetting }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveReportCardSubjectSetting, initialState);
  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      router.refresh();
    } else toast.error(state.message);
  }, [state, router]);
  return (
    <form action={action} className="grid gap-3 border-t border-border-subtle py-3 first:border-t-0 lg:grid-cols-[minmax(0,1.5fr)_110px_140px_150px_auto] lg:items-center">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="subjectId" value={subject.subjectId} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{subject.subjectName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subject.subjectCode}</p>
      </div>
      <div>
        <label className="sr-only sm:hidden" htmlFor={`minimum-pass-mark-${subject.subjectId}`}>Pass mark % for {subject.subjectName}</label>
        <input id={`minimum-pass-mark-${subject.subjectId}`} type="number" name="minimumPassMark" min="0" max="100" step="0.01" defaultValue={subject.minimumPassMark ?? ""} className={fieldClass} placeholder="40" aria-label={`Pass mark % for ${subject.subjectName}`} />
      </div>
      <Checkbox name="promotional" defaultChecked={subject.promotional} label="Promotional" />
      <Checkbox name="showOnReportCard" defaultChecked={subject.showOnReportCard} label="Show on report" />
      {state.fieldErrors ? <p role="alert" className="text-xs text-destructive lg:col-span-full">Enter a pass mark between 0 and 100.</p> : null}
      <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-9 items-center justify-center gap-2 bg-surface-muted px-3 text-xs font-medium hover:bg-surface-elevated disabled:opacity-60">{pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save</button>
    </form>
  );
}

export function ReportCardSettingsPanel({ schoolId, schoolName, settings }: { schoolId: string; schoolName: string; settings: ReportCardSchoolSettings }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveReportCardSchoolSettings, initialState);
  const [logoPending, startLogoTransition] = useTransition();
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const profile = settings.documentProfile;
  const report = settings.reportCardSettings;
  const isNamibHigh = schoolName.trim().toLowerCase() === "namib high school";
  const [schoolNameFont, setSchoolNameFont] = useState<"default" | "old_english">(isNamibHigh ? profile.schoolNameFont : "default");
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl);
  const [logoStoragePath, setLogoStoragePath] = useState(profile.logoStoragePath);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [showDocumentErrors, setShowDocumentErrors] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      router.refresh();
      queueMicrotask(() => {
        setDocumentOpen(false);
        panelRef.current?.querySelector<HTMLButtonElement>('[aria-controls="report-card-document-editor"]')?.focus();
      });
    } else {
      toast.error(state.message);
    }
  }, [state, router]);

  async function uploadLogo(file?: File) {
    if (!file || logoUploading) return;
    if (!allowedLogoTypes.has(file.type)) {
      toast.error("Choose a JPG or PNG school logo.");
      if (logoInputRef.current) logoInputRef.current.value = "";
      return;
    }
    if (file.size > maxLogoBytes) {
      toast.error("School logo images must be 5 MB or smaller.");
      if (logoInputRef.current) logoInputRef.current.value = "";
      return;
    }

    setLogoUploading(true);
    const supabase = createSupabaseBrowserClient();
    const path = `${schoolId}/logos/logo-${Date.now()}-${crypto.randomUUID()}.${logoExtension(file.type)}`;
    try {
      const { error } = await supabase.storage.from("school-document-assets").upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) {
        toast.error(logoUploadFailureMessage(error));
        return;
      }

      const result = await saveUploadedSchoolLogo(schoolId, path);
      if (!result.success) {
        // The logo bucket is intentionally append-only so an asset referenced by a
        // certified historical snapshot can never be deleted by a normal user.
        toast.error(result.message ?? "The uploaded logo could not be saved.");
        return;
      }

      const { data: signedPreview } = await supabase.storage.from("school-document-assets").createSignedUrl(path, 3600);
      setLogoStoragePath(path);
      setLogoUrl(signedPreview?.signedUrl ?? URL.createObjectURL(file));
      toast.success(result.message ?? "School document logo updated.");
      router.refresh();
    } catch (error) {
      toast.error(logoUploadFailureMessage(error));
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  function removeLogo() {
    startLogoTransition(async () => {
      const result = await saveUploadedSchoolLogo(schoolId, "");
      if (!result.success) {
        toast.error(result.message ?? "The school logo could not be removed.");
        return;
      }
      setLogoStoragePath("");
      setLogoUrl("");
      toast.success(result.message ?? "School document logo removed.");
      router.refresh();
    });
  }

  const legacyLogoUrl = profile.logoStoragePath ? "" : profile.logoUrl;

  return (
    <section ref={panelRef} className="mt-5 space-y-5">
      <ConfigurationCard
        icon={FileText}
        title="Report card & document identity"
        description={`Document settings for ${schoolName}.`}
        open={documentOpen}
        onToggle={() => {
          setShowDocumentErrors(false);
          setSchoolNameFont(isNamibHigh ? profile.schoolNameFont : "default");
          setDocumentOpen((current) => !current);
        }}
        panelId="report-card-document-editor"
        disabled={pending || logoUploading || logoPending}
        summary={(
          <div className="space-y-3 text-sm">
            <p className="text-xs leading-5 text-muted-foreground">These values are frozen into each generated report so historical certified cards do not change when settings are edited later.</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              {logoUrl ? <img src={logoUrl} alt={`${schoolName} saved logo`} className="size-12 shrink-0 object-contain" /> : <p className="text-xs text-muted-foreground">No school logo configured.</p>}
              <dl className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Former / secondary name", profile.formerName],
                  ["Physical address", profile.physicalAddress],
                  ["Town / city", profile.town],
                  ["Telephone", profile.telephone],
                  ["Fax", profile.fax],
                  ["School email", profile.email],
                  ["Postal address", profile.postalAddress],
                  ["Document font", isNamibHigh && profile.schoolNameFont === "old_english" ? "Old English / blackletter" : "Default ScolaPro font"],
                ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value || "Not configured"}</dd></div>)}
              </dl>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">Percentages: {report.showPercentages ? "Shown" : "Hidden"} · Non-promotional subjects: {report.showNonPromotionalSubjects ? "Shown" : "Hidden"} · Pass-mark legend: {report.showPassMarkLegend ? "Shown" : "Hidden"}</p>
            <p className="break-words text-xs leading-5 text-muted-foreground">Manual / reviewed remarks · {report.defaultRemark || "No fallback remark configured."}</p>
          </div>
        )}
        editor={<form action={action} onSubmit={() => setShowDocumentErrors(true)} className="space-y-5" noValidate>
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="logoUrl" value={logoStoragePath ? "" : legacyLogoUrl} />
          <input type="hidden" name="logoStoragePath" value={logoStoragePath} />
          <input type="hidden" name="remarksMode" value="manual" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div><label className={formFieldLabelClass} htmlFor="report-card-formerName">Former / secondary school name</label><input id="report-card-formerName" name="formerName" defaultValue={profile.formerName} className={`${fieldClass} mt-1.5`} placeholder="Formerly …" /></div>
            <div><label className={formFieldLabelClass} htmlFor="report-card-physicalAddress">Physical address</label><input id="report-card-physicalAddress" name="physicalAddress" defaultValue={profile.physicalAddress} className={`${fieldClass} mt-1.5`} placeholder="Street / location" /></div>
            <div><label className={formFieldLabelClass} htmlFor="report-card-town">Town / city</label><input id="report-card-town" name="town" defaultValue={profile.town} className={`${fieldClass} mt-1.5`} /></div>
            <div><label className={formFieldLabelClass} htmlFor="report-card-telephone">Telephone</label><input id="report-card-telephone" name="telephone" defaultValue={profile.telephone} className={`${fieldClass} mt-1.5`} /></div>
            <div><label className={formFieldLabelClass} htmlFor="report-card-fax">Fax</label><input id="report-card-fax" name="fax" defaultValue={profile.fax} className={`${fieldClass} mt-1.5`} /></div>
            <div><label className={formFieldLabelClass} htmlFor="report-card-email">School email</label><input id="report-card-email" type="email" name="email" defaultValue={profile.email} className={`${fieldClass} mt-1.5`} /></div>
            <div><label className={formFieldLabelClass} htmlFor="report-card-postalAddress">Postal address</label><input id="report-card-postalAddress" name="postalAddress" defaultValue={profile.postalAddress} className={`${fieldClass} mt-1.5`} placeholder="P O Box …" /></div>
            <div className="md:col-span-2 xl:col-span-1">
              <p className={formFieldLabelClass}>Official school logo</p>
              <div className="mt-1.5 flex items-center gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3">
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle bg-white">
                  {logoUrl ? <img src={logoUrl} alt={`${schoolName} logo`} className="max-h-14 max-w-14 object-contain" /> : <School className="size-6 text-muted-foreground" aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-5 text-muted-foreground">JPG or PNG, up to 5 MB. Replacing the logo keeps old stored versions so historical certified reports remain reproducible.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className={`scolapro-cta inline-flex min-h-9 items-center gap-2 bg-surface-muted px-3 text-xs font-medium hover:bg-surface ${logoUploading ? "cursor-wait opacity-60" : "cursor-pointer"}`}>
                      {logoUploading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-3.5" aria-hidden="true" />} {logoUploading ? "Uploading…" : "Choose logo"}
                      <input ref={logoInputRef} type="file" accept="image/jpeg,image/png" disabled={logoUploading || logoPending} className="sr-only" onChange={(event) => uploadLogo(event.target.files?.[0])} />
                    </label>
                    {logoStoragePath ? <button type="button" disabled={logoPending || logoUploading} onClick={removeLogo} className="scolapro-cta inline-flex min-h-9 items-center gap-2 px-3 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60"><Trash2 className="size-3.5" /> Remove</button> : null}
                  </div>
                </div>
              </div>
            </div>
            {isNamibHigh ? <Picker label="Namib High document school-name font" name="schoolNameFont" value={schoolNameFont} onChange={(value) => setSchoolNameFont(value as "default" | "old_english")} placeholder="Choose document font" options={[{ value: "default", label: "Default ScolaPro font" }, { value: "old_english", label: "Old English / blackletter", helper: "Namib High School only" }]} /> : <div><input type="hidden" name="schoolNameFont" value="default" /><p className={formFieldLabelClass}>Official document font</p><div className="mt-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted px-3 py-2.5 text-sm">Default ScolaPro font</div><p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">Old English is reserved for Namib High School&apos;s established document identity and is not available to other schools.</p></div>}
          </div>

          <div className="rounded-[var(--radius-md)] bg-surface-muted p-4">
            <div className="mb-3"><h3 className="text-sm font-semibold">Report-card presentation</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">The term matrix automatically expands across one, two or three available terms.</p></div>
            <div className="grid gap-3 lg:grid-cols-3">
              <Toggle name="showPercentages" defaultChecked={report.showPercentages} label="Show percentage columns" description="Off uses Mark + Symbol. On uses Mark + % + Symbol for each printed term." />
              <Toggle name="showNonPromotionalSubjects" defaultChecked={report.showNonPromotionalSubjects} label="Show non-promotional subjects" description="When visible, a leading star is printed before the subject name." />
              <Toggle name="showPassMarkLegend" defaultChecked={report.showPassMarkLegend} label="Explain pass-mark stars" description="A raised star beside a learner mark identifies a mark below that subject's configured minimum." />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
            <div>
              <p className={formFieldLabelClass}>Remarks mode</p>
              <div className="mt-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted px-3 py-2.5 text-sm">Manual / reviewed</div>
              <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">Certified reports currently use a reviewed manual remark or the fallback text. Rules-based and AI-assisted remark generation will only appear here after their governed review workflows are implemented.</p>
            </div>
            <div><label className={formFieldLabelClass} htmlFor="report-card-defaultRemark">Default / fallback remark</label><textarea id="report-card-defaultRemark" name="defaultRemark" defaultValue={report.defaultRemark} rows={3} className={`${fieldClass} mt-1.5 py-2`} placeholder="Optional fallback remark" /><p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">Used when a generated snapshot has no reviewed learner-specific remark.</p></div>
          </div>

          {showDocumentErrors && !pending && state.message && !state.success ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
          {showDocumentErrors && !pending && state.fieldErrors ? <div role="alert" className="space-y-1 text-sm text-destructive">{Object.entries(state.fieldErrors).map(([field, errors]) => <p key={field}>{errors.join(" ")}</p>)}</div> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
            <button type="button" disabled={pending || logoUploading || logoPending} className="scolapro-cta min-h-10 bg-surface-muted px-4 text-sm font-medium" onClick={() => {
              setShowDocumentErrors(false);
              setSchoolNameFont(isNamibHigh ? profile.schoolNameFont : "default");
              setDocumentOpen(false);
              panelRef.current?.querySelector<HTMLButtonElement>('[aria-controls="report-card-document-editor"]')?.focus();
            }}>Cancel</button>
            <button type="submit" disabled={pending || logoUploading || logoPending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Saving…" : "Save document settings"}</button></div>
        </form>}
      />

      <ConfigurationCard
        icon={School}
        tone="scolapro-tone-mint"
        title="Subject report rules"
        description="Minimum pass marks, promotion and report visibility."
        open={subjectsOpen}
        onToggle={() => setSubjectsOpen((current) => !current)}
        panelId="report-card-subject-editor"
        summary={settings.subjects.length ? (
          <dl className="max-h-[min(42vh,28rem)] space-y-3 overflow-y-auto overscroll-contain text-sm scolapro-scrollbar">
            {settings.subjects.map((subject) => <div key={subject.subjectId} className="min-w-0">
              <dt className="scolapro-record-title break-words">{subject.subjectName} <span className="text-xs font-normal text-muted-foreground">{subject.subjectCode}</span></dt>
              <dd className="mt-1 text-xs leading-5 text-muted-foreground">Pass mark: {subject.minimumPassMark == null ? "Not configured" : `${subject.minimumPassMark}%`} · {subject.promotional ? "Promotional" : "Non-promotional"} · {subject.showOnReportCard ? "Shown on report" : "Hidden from report"}</dd>
            </div>)}
          </dl>
        ) : <p className="text-sm text-muted-foreground">Configure active subjects first; their report-card rules will appear here.</p>}
        editor={settings.subjects.length ? (
          <div>
            <div className="hidden grid-cols-[minmax(0,1.5fr)_110px_140px_150px_auto] items-center gap-3 border-b border-border-subtle px-0 py-2 text-[0.68rem] font-medium text-muted-foreground lg:grid" aria-hidden="true">
              <span>Subject</span>
              <span>Pass mark %</span>
              <span>Promotional</span>
              <span>Show on report</span>
              <span className="sr-only">Actions</span>
            </div>
            <div className="max-h-[min(62vh,42rem)] overflow-x-hidden overflow-y-auto overscroll-contain scolapro-scrollbar">
              {settings.subjects.map((subject) => <SubjectRule key={subject.subjectId} schoolId={schoolId} subject={subject} />)}
            </div>
          </div>
        ) : null}
        disabled={!settings.subjects.length}
      />
    </section>
  );
}
