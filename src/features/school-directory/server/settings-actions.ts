"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SchoolDirectorySettingsState = { success?: boolean; message?: string; fieldErrors?: Record<string, string[]> };

const directoryContactSchema = z.object({
  schoolId: z.string().uuid(),
  cellphone: z.string().trim().max(80, "Cellphone must be 80 characters or fewer."),
  principalPublicEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid public email address.")]),
});

export async function saveSchoolDirectoryContact(_previous: SchoolDirectorySettingsState, formData: FormData): Promise<SchoolDirectorySettingsState> {
  const parsed = directoryContactSchema.safeParse({
    schoolId: formData.get("schoolId"),
    cellphone: formData.get("cellphone") ?? "",
    principalPublicEmail: formData.get("principalPublicEmail") ?? "",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const context = await getUserContext();
  if (!context.user) return { message: "You need to sign in to change school settings." };
  const membership = context.memberships.find(
    (item) => item.schoolId === parsed.data.schoolId && ["school_admin", "principal", "deputy_principal"].includes(item.roleKey),
  );
  if (!membership) return { message: "You do not have permission to change this school's directory contact details." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_school_directory_contact", {
    p_school_id: parsed.data.schoolId,
    p_cellphone: parsed.data.cellphone,
    p_principal_public_email: parsed.data.principalPublicEmail,
  });
  if (error) return { message: "Directory contact details could not be saved. Please try again." };
  revalidatePath("/school/settings");
  revalidatePath("/school-directory");
  return { success: true, message: "School Directory contact details saved." };
}
