"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportCardSettingsState = { success?: boolean; message?: string; fieldErrors?: Record<string, string[]> };

const schoolSettingsSchema = z.object({
  schoolId: z.string().uuid(),
  formerName: z.string().trim().max(160).optional().default(""),
  logoUrl: z.string().trim().max(1000).optional().default(""),
  physicalAddress: z.string().trim().max(240).optional().default(""),
  telephone: z.string().trim().max(80).optional().default(""),
  fax: z.string().trim().max(80).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid school email address.")]).optional().default(""),
  postalAddress: z.string().trim().max(180).optional().default(""),
  town: z.string().trim().max(100).optional().default(""),
  schoolNameFont: z.enum(["default", "old_english"]).default("default"),
  showPercentages: z.boolean(),
  showNonPromotionalSubjects: z.boolean(),
  showPassMarkLegend: z.boolean(),
  remarksMode: z.enum(["manual", "rules", "ai_assisted"]),
  defaultRemark: z.string().trim().max(600).optional().default(""),
});

const subjectSchema = z.object({
  schoolId: z.string().uuid(),
  subjectId: z.string().uuid(),
  minimumPassMark: z.union([z.literal(""), z.coerce.number().min(0).max(100)]),
  promotional: z.boolean(),
  showOnReportCard: z.boolean(),
});

async function canManageSchool(schoolId: string) {
  const context = await getUserContext();
  return Boolean(context.user && context.memberships.some((membership) => membership.schoolId === schoolId && ["school_admin", "principal", "deputy_principal"].includes(membership.roleKey)));
}

function checked(formData: FormData, key: string) { return formData.get(key) === "on" || formData.get(key) === "true"; }

export async function saveReportCardSchoolSettings(_previous: ReportCardSettingsState, formData: FormData): Promise<ReportCardSettingsState> {
  const parsed = schoolSettingsSchema.safeParse({
    schoolId: formData.get("schoolId"),
    formerName: formData.get("formerName") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
    physicalAddress: formData.get("physicalAddress") ?? "",
    telephone: formData.get("telephone") ?? "",
    fax: formData.get("fax") ?? "",
    email: formData.get("email") ?? "",
    postalAddress: formData.get("postalAddress") ?? "",
    town: formData.get("town") ?? "",
    schoolNameFont: formData.get("schoolNameFont") ?? "default",
    showPercentages: checked(formData, "showPercentages"),
    showNonPromotionalSubjects: checked(formData, "showNonPromotionalSubjects"),
    showPassMarkLegend: checked(formData, "showPassMarkLegend"),
    remarksMode: formData.get("remarksMode") ?? "manual",
    defaultRemark: formData.get("defaultRemark") ?? "",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to configure report cards for this school." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_report_card_school_settings", {
    p_school_id: parsed.data.schoolId,
    p_document_profile: {
      former_name: parsed.data.formerName,
      logo_url: parsed.data.logoUrl,
      physical_address: parsed.data.physicalAddress,
      telephone: parsed.data.telephone,
      fax: parsed.data.fax,
      email: parsed.data.email,
      postal_address: parsed.data.postalAddress,
      town: parsed.data.town,
      school_name_font: parsed.data.schoolNameFont,
    },
    p_report_card_settings: {
      show_percentages: parsed.data.showPercentages,
      show_non_promotional_subjects: parsed.data.showNonPromotionalSubjects,
      show_pass_mark_legend: parsed.data.showPassMarkLegend,
      remarks_mode: parsed.data.remarksMode,
      default_remark: parsed.data.defaultRemark,
    },
  });
  if (error) return { message: "Report-card settings could not be saved. Please try again." };
  revalidatePath("/school/setup");
  revalidatePath("/reports/report-cards");
  return { success: true, message: "Report-card document settings saved." };
}

export async function saveReportCardSubjectSetting(_previous: ReportCardSettingsState, formData: FormData): Promise<ReportCardSettingsState> {
  const parsed = subjectSchema.safeParse({
    schoolId: formData.get("schoolId"),
    subjectId: formData.get("subjectId"),
    minimumPassMark: String(formData.get("minimumPassMark") ?? "").trim(),
    promotional: checked(formData, "promotional"),
    showOnReportCard: checked(formData, "showOnReportCard"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!(await canManageSchool(parsed.data.schoolId))) return { message: "You do not have permission to configure this subject." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_report_card_subject_setting", {
    p_school_id: parsed.data.schoolId,
    p_subject_id: parsed.data.subjectId,
    p_minimum_pass_mark: parsed.data.minimumPassMark === "" ? null : parsed.data.minimumPassMark,
    p_promotional: parsed.data.promotional,
    p_show_on_report_card: parsed.data.showOnReportCard,
  });
  if (error) return { message: "The subject report-card rule could not be saved." };
  revalidatePath("/school/setup");
  revalidatePath("/reports/report-cards");
  return { success: true, message: "Subject report-card rule saved." };
}
