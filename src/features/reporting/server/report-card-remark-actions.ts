"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportCardRemarkActionState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const schema = z.object({
  snapshotId: z.string().uuid(),
  remark: z.string().max(1200, "Keep the report-card remark within 1,200 characters."),
});

const managerRoles = new Set(["school_admin", "principal", "deputy_principal"]);

export async function saveReportCardRemark(
  _previous: ReportCardRemarkActionState,
  formData: FormData,
): Promise<ReportCardRemarkActionState> {
  const parsed = schema.safeParse({
    snapshotId: formData.get("snapshotId"),
    remark: String(formData.get("remark") ?? ""),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, message: "Check the report-card remark and try again." };
  }

  const context = await getUserContext();
  if (!context.user || !context.memberships.some((membership) => managerRoles.has(membership.roleKey))) {
    return { message: "Report-card remarks are restricted to School Administration and school management." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_report_card_snapshot_remark", {
    p_snapshot_id: parsed.data.snapshotId,
    p_remark: parsed.data.remark,
  });

  if (error) {
    if (error.message.includes("Only draft report-card remarks")) {
      return { message: "This report card has already been certified or published, so its frozen remark can no longer be changed." };
    }
    if (error.message.includes("Permission denied")) {
      return { message: "You do not have permission to edit this learner's report-card remark." };
    }
    return { message: "The learner-specific report-card remark could not be saved." };
  }

  revalidatePath("/reports/report-cards");
  return {
    success: true,
    message: parsed.data.remark.trim()
      ? "Learner-specific report-card remark saved."
      : "Learner-specific remark cleared; the configured fallback remark will be used.",
  };
}
