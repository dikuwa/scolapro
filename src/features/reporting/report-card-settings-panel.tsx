"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImagePlus, LoaderCircle, Save, School, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Picker } from "@/components/ui/picker";
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
const allowedLogoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxLogoBytes = 5 * 1024 * 1024;

function logoExtension(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function Toggle({ name, defaultChecked, label, description }: { name: string; defaultChecked: boolean; label: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated px-3 py-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-[color:var(--brand)]" />
      <span><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span></span>
    </label>
  );
}

function SubjectRule({ schoolId, subject }: { schoolId: string; subject: ReportCardSubjectSetting }) {
  const [state, action, pending] = useActionState(saveReportCardSubjectSetting, initialState);
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
  return (
    <form action={action} className="grid gap-3 border-t border-border-subtle py-3 first:border-t-0 sm:grid-cols-[minmax(0,1.5fr)_110px_140px_150px_auto] sm:items-center">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="subjectId" value={subject.subjectId} />
      <div className="min-w-0"><p className="truncate text-sm font-medium">{subject.subjectName}</p><p className="mt-0.5 text-xs text-muted-foreground">{subject.subjectCode}</p></div>
      <div><label className="text-[0.68rem] font-medium text-muted-foreground">Pass mark %</label><input type="number" name="minimumPassMark" min="0" max="100" step="0.01" defaultValue={subject.minimumPassMark ?? ""} className={`${fieldClass} mt-1`} placeholder="40" /></div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="promotional" defaultChecked={subject.promotional} className="size-4 accent-[color:var(--brand)]" /> Promotional</label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="showOnReportCard" defaultChecked={subject.showOnReportCard} className="size-4 accent-[color:var(--brand)]" /> Show on report</label>
      <button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-9 items-center justify-center gap-2 bg-surface-muted px-3 text-xs font-medium hover:bg-surface-elevated disabled:opacity-60">{pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save</button>
    </form>
  );
}

export function ReportCardSettingsPanel({ schoolId, schoolName, settings }: { schoolId: string; schoolName: string; settings: ReportCardSchoolSettings }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveReportCardSchoolSettings, initialState);
  const [logoPending, startLogoTransition] = useTransition();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const profile = settings.documentProfile;
  const report = settings.reportCardSettings;
  const isNamibHigh = schoolName.trim().toLowerCase() === "namib high school";
  const [schoolNameFont, setSchoolNameFont] = useState<"default" | "old_english">(isNamibHigh ? profile.schoolNameFont : "default");
  const [remarksMode, setRemarksMode] = useState(report.remarksMode);
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl);
  const [logoStoragePath, setLogoStoragePath] = useState(profile.logoStoragePath);
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  async function uploadLogo(file?: File) {
    if (!file) return;
    if (!allowedLogoTypes.has(file.type)) {
      toast.error("Choose a JPG, PNG or WebP school logo.");
      return;
    }
    if (file.size > maxLogoBytes) {
      toast.error("School logo images must be 5 MB or smaller.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const path = `${schoolId}/logos/logo-${Date.now()}-${crypto.randomUUID()}.${logoExtension(file.type)}`;
    const previousPath = logoStoragePath;
    const { error } = await supabase.storage.from("school-document-assets").upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) {
      toast.error(error.message.toLowerCase().includes("row-level security") ? "Your account is not allowed to change this school logo." : "The school logo upload failed.");
      return;
    }

    const result = await saveUploadedSchoolLogo(schoolId, path);
    if (!result.success) {
      await supabase.storage.from("school-document-assets").remove([path]);
      toast.error(result.message ?? "The uploaded logo could not be saved.");
      return;
    }

    setLogoStoragePath(path);
    setLogoUrl(`${supabase.storage.from("school-document-assets").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`);
    if (previousPath && previousPath !== path) {
      // Do not delete the previous object: certified historical snapshots may still reference it.
    }
    if (logoInputRef.current) logoInputRef.current.value = "";
    toast.success(result.message ?? "School document logo updated.");
    router.refresh();
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

  return (
    <section className="mt-5 space-y-5">
      <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-start gap-3 border-b border-border-subtle pb-4"><span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><FileText className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Report card & document identity</h2><p className="scolapro-section-description">These values belong to {schoolName}. They are frozen into each generated report so historical certified cards do not change when settings are edited later.</p></div></div>
        <form action={action} className="mt-5 space-y-5" noValidate>
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="logoUrl" value={logoStoragePath ? "" : profile.logoUrl} />
          <input type="hidden" name="logoStoragePath" value={logoStoragePath} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div><label className="text-xs font-medium">Former / secondary school name</label><input name="formerName" defaultValue={profile.formerName} className={`${fieldClass} mt-1.5`} placeholder="Formerly …" /></div>
            <div><label className="text-xs font-medium">Physical address</label><input name="physicalAddress" defaultValue={profile.physicalAddress} className={`${fieldClass} mt-1.5`} placeholder="Street / location" /></div>
            <div><label className="text-xs font-medium">Town / city</label><input name="town" defaultValue={profile.town} className={`${fieldClass} mt-1.5`} /></div>
            <div><label className="text-xs font-medium">Telephone</label><input name="telephone" defaultValue={profile.telephone} className={`${fieldClass} mt-1.5`} /></div>
            <div><label className="text-xs font-medium">Fax</label><input name="fax" defaultValue={profile.fax} className={`${fieldClass} mt-1.5`} /></div>
            <div><label className="text-xs font-medium">School email</label><input type="email" name="email" defaultValue={profile.email} className={`${fieldClass} mt-1.5`} /></div>
            <div><label className="text-xs font-medium">Postal address</label><input name="postalAddress" defaultValue={profile.postalAddress} className={`${fieldClass} mt-1.5`} placeholder="P O Box …" /></div>
            <div className="md:col-span-2 xl:col-span-1">
              <p className="text-xs font-medium">Official school logo</p>
              <div className="mt-1.5 flex items-center gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3">
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle bg-white">
                  {logoUrl ? <img src={logoUrl} alt={`${schoolName} logo`} className="max-h-14 max-w-14 object-contain" /> : <School className="size-6 text-muted-foreground" aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-5 text-muted-foreground">JPG, PNG or WebP, up to 5 MB. Replacing the logo keeps old stored versions so historical certified reports remain reproducible.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="scolapro-cta inline-flex min-h-9 cursor-pointer items-center gap-2 bg-surface-muted px-3 text-xs font-medium hover:bg-surface">
                      <ImagePlus className="size-3.5" aria-hidden="true" /> Choose logo
                      <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => uploadLogo(event.target.files?.[0])} />
                    </label>
                    {logoStoragePath ? <button type="button" disabled={logoPending} onClick={removeLogo} className="scolapro-cta inline-flex min-h-9 items-center gap-2 px-3 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60"><Trash2 className="size-3.5" /> Remove</button> : null}
                  </div>
                </div>
              </div>
            </div>
            {isNamibHigh ? <Picker label="Namib High document school-name font" name="schoolNameFont" value={schoolNameFont} onChange={(value) => setSchoolNameFont(value as "default" | "old_english")} placeholder="Choose document font" options={[{ value: "default", label: "Default ScolaPro font" }, { value: "old_english", label: "Old English / blackletter", helper: "Namib High School only" }]} /> : <div><input type="hidden" name="schoolNameFont" value="default" /><p className="text-xs font-medium">Official document font</p><div className="mt-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted px-3 py-2.5 text-sm">Default ScolaPro font</div><p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">Old English is reserved for Namib High School&apos;s established document identity and is not available to other schools.</p></div>}
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
            <Picker label="Remarks mode" name="remarksMode" value={remarksMode} onChange={(value) => setRemarksMode(value as "manual" | "rules" | "ai_assisted")} placeholder="Choose remarks mode" options={[{ value: "manual", label: "Manual", helper: "Teacher enters/reviews remarks" }, { value: "rules", label: "Rules-based", helper: "Deterministic school rules" }, { value: "ai_assisted", label: "AI assisted", helper: "AI suggests; teacher reviews before certification" }]} />
            <div><label className="text-xs font-medium">Default / fallback remark</label><textarea name="defaultRemark" defaultValue={report.defaultRemark} rows={3} className={`${fieldClass} mt-1.5 py-2`} placeholder="Optional fallback remark" /></div>
          </div>

          <div className="flex justify-end border-t border-border-subtle pt-4"><button type="submit" disabled={pending} className="scolapro-cta inline-flex min-h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "Saving…" : "Save document settings"}</button></div>
        </form>
      </div>

      <div className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className="flex items-start gap-3 border-b border-border-subtle pb-4"><span className="scolapro-tone-mint grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]"><School className="size-4" aria-hidden="true" /></span><div><h2 className="scolapro-section-title">Subject report rules</h2><p className="scolapro-section-description">Set each subject&apos;s minimum pass mark and whether it is promotional. A mark below its own threshold receives a small raised star beside the mark.</p></div></div>
        <div className="mt-2">{settings.subjects.length ? settings.subjects.map((subject) => <SubjectRule key={subject.subjectId} schoolId={schoolId} subject={subject} />) : <p className="py-6 text-sm text-muted-foreground">Configure active subjects first; their report-card rules will appear here.</p>}</div>
      </div>
    </section>
  );
}
