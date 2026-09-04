import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

export type ReportCardSubjectSetting = {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  minimumPassMark: number | null;
  promotional: boolean;
  showOnReportCard: boolean;
};

export type ReportCardSchoolSettings = {
  documentProfile: {
    formerName: string;
    logoUrl: string;
    logoStoragePath: string;
    physicalAddress: string;
    telephone: string;
    fax: string;
    email: string;
    postalAddress: string;
    town: string;
    schoolNameFont: "default" | "old_english";
  };
  reportCardSettings: {
    showPercentages: boolean;
    showNonPromotionalSubjects: boolean;
    showPassMarkLegend: boolean;
    remarksMode: "manual" | "rules" | "ai_assisted";
    defaultRemark: string;
  };
  subjects: ReportCardSubjectSetting[];
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
function text(value: unknown) { return value == null ? "" : String(value); }
function bool(value: unknown, fallback: boolean) { return typeof value === "boolean" ? value : fallback; }
function numeric(value: unknown): number | null { const parsed = Number(value); return value !== null && value !== "" && Number.isFinite(parsed) ? parsed : null; }

export async function getReportCardSchoolSettings(schoolId: string): Promise<ReportCardSchoolSettings> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_report_card_school_settings", { p_school_id: schoolId });
  if (error) throw new Error("Unable to load report-card settings.");
  const root = record(data);
  const profile = record(root.document_profile);
  const settings = record(root.report_card_settings);
  const subjects = Array.isArray(root.subjects) ? root.subjects.map(record) : [];
  const remarksMode = text(settings.remarks_mode);
  const logoStoragePath = text(profile.logo_storage_path);
  const storedLogoUrl = logoStoragePath
    ? supabase.storage.from("school-document-assets").getPublicUrl(logoStoragePath).data.publicUrl
    : "";

  return {
    documentProfile: {
      formerName: text(profile.former_name),
      logoUrl: storedLogoUrl || text(profile.logo_url),
      logoStoragePath,
      physicalAddress: text(profile.physical_address),
      telephone: text(profile.telephone),
      fax: text(profile.fax),
      email: text(profile.email),
      postalAddress: text(profile.postal_address),
      town: text(profile.town),
      schoolNameFont: text(profile.school_name_font) === "old_english" ? "old_english" : "default",
    },
    reportCardSettings: {
      showPercentages: bool(settings.show_percentages, false),
      showNonPromotionalSubjects: bool(settings.show_non_promotional_subjects, true),
      showPassMarkLegend: bool(settings.show_pass_mark_legend, true),
      remarksMode: remarksMode === "rules" || remarksMode === "ai_assisted" ? remarksMode : "manual",
      defaultRemark: text(settings.default_remark),
    },
    subjects: subjects.map((item) => ({
      subjectId: text(item.subject_id),
      subjectCode: text(item.subject_code),
      subjectName: text(item.subject_name),
      minimumPassMark: numeric(item.minimum_pass_mark),
      promotional: bool(item.promotional, true),
      showOnReportCard: bool(item.show_on_report_card, true),
    })),
  };
}
