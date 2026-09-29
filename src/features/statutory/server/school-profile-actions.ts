"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SchoolStatutoryProfileState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).optional().default("");

const profileSchema = z.object({
  schoolId: z.string().uuid(),
  payPoint: optionalText(120, "Pay point"),
  constituency: optionalText(120, "Constituency"),
  schoolClassification: optionalText(120, "School classification"),
  ownership: optionalText(120, "Ownership"),
  urbanRural: optionalText(80, "Urban / rural"),
  satelliteSchoolInformation: optionalText(240, "Satellite school information"),
  isSatelliteSchool: z.boolean(),
  isClusterCentre: z.boolean(),
});

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function currentManageableSchool(context: Awaited<ReturnType<typeof getUserContext>>, schoolId: string) {
  const membership = context.currentSchoolMembership;
  if (!membership || membership.schoolId !== schoolId) return null;
  return ["school_admin", "principal", "deputy_principal"].includes(membership.roleKey) ? membership : null;
}

export async function saveSchoolStatutoryEmisProfile(
  _previous: SchoolStatutoryProfileState,
  formData: FormData,
): Promise<SchoolStatutoryProfileState> {
  const parsed = profileSchema.safeParse({
    schoolId: formData.get("schoolId"),
    payPoint: formData.get("payPoint") ?? "",
    constituency: formData.get("constituency") ?? "",
    schoolClassification: formData.get("schoolClassification") ?? "",
    ownership: formData.get("ownership") ?? "",
    urbanRural: formData.get("urbanRural") ?? "",
    satelliteSchoolInformation: formData.get("satelliteSchoolInformation") ?? "",
    isSatelliteSchool: checked(formData, "isSatelliteSchool"),
    isClusterCentre: checked(formData, "isClusterCentre"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const context = await getUserContext();
  if (!context.user || !currentManageableSchool(context, parsed.data.schoolId)) {
    return { message: "You do not have current-school authority to change this Statutory / EMIS Profile." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_school_statutory_emis_profile", {
    p_school_id: parsed.data.schoolId,
    p_profile: {
      pay_point: parsed.data.payPoint,
      constituency: parsed.data.constituency,
      school_classification: parsed.data.schoolClassification,
      ownership: parsed.data.ownership,
      urban_rural: parsed.data.urbanRural,
      is_satellite_school: parsed.data.isSatelliteSchool,
      satellite_school_information: parsed.data.satelliteSchoolInformation,
      is_cluster_centre: parsed.data.isClusterCentre,
    },
  });

  if (error) return { message: "The Statutory / EMIS Profile could not be saved. Please try again." };

  revalidatePath("/school/settings");
  return { success: true, message: "Statutory / EMIS Profile saved." };
}
